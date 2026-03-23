import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Board } from '../boards/board.schema';
import { Card } from '../cards/card.schema';
import { Column } from '../columns/column.schema';
import { BoardMember } from './board-member.schema';
import { BoardRole, Permission, ROLE_PERMISSIONS } from './permissions.constants';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMember>,
    @InjectModel(Board.name)
    private readonly boardModel: Model<Board>,
    @InjectModel(Column.name)
    private readonly columnModel: Model<Column>,
    @InjectModel(Card.name)
    private readonly cardModel: Model<Card>,
  ) {}

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return new Types.ObjectId(id);
  }

  private async getRole(userId: string, boardId: string): Promise<BoardRole | null> {
    const boardObjectId = this.toObjectId(boardId);
    const userObjectId = this.toObjectId(userId);

    const board = await this.boardModel.findOne({
      _id: boardObjectId,
      isDeleted: { $ne: true },
    }).exec();

    if (!board) {
      return null;
    }

    if (board.ownerId.toString() === userId) {
      return 'owner';
    }

    const member = await this.boardMemberModel.findOne({
      boardId: boardObjectId,
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).exec();

    if (member) {
      return member.role;
    }

    return null;
  }

  async hasPermission(userId: string, boardId: string, permission: Permission): Promise<boolean> {
    const role = await this.getRole(userId, boardId);
    if (!role) {
      return false;
    }
    return ROLE_PERMISSIONS[role].has(permission);
  }

  async assertPermission(userId: string, boardId: string, permission: Permission): Promise<void> {
    const allowed = await this.hasPermission(userId, boardId, permission);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  async resolveBoardIdFromColumn(columnId: string): Promise<string> {
    const column = await this.columnModel.findOne({
      _id: this.toObjectId(columnId),
      isDeleted: { $ne: true },
    }).exec();
    if (!column) {
      throw new NotFoundException('Column not found');
    }
    return column.boardId.toString();
  }

  async resolveBoardIdFromCard(cardId: string): Promise<string> {
    const card = await this.cardModel.findOne({
      _id: this.toObjectId(cardId),
      isDeleted: { $ne: true },
    }).exec();
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    return card.boardId.toString();
  }

  async getBoardIdsForUser(userId: string): Promise<string[]> {
    const userObjectId = this.toObjectId(userId);
    const memberships = await this.boardMemberModel.find({
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).select({ boardId: 1 }).exec();

    const boardIds = new Set<string>(memberships.map((m) => m.boardId.toString()));

    const ownerBoards = await this.boardModel.find({
      ownerId: userObjectId,
      isDeleted: { $ne: true },
    }).select({ _id: 1 }).exec();

    ownerBoards.forEach((b) => boardIds.add(b._id.toString()));
    return Array.from(boardIds);
  }

  async ensureOwnerMembership(boardId: string, ownerId: string): Promise<void> {
    await this.boardMemberModel.updateOne(
      {
        boardId: this.toObjectId(boardId),
        userId: this.toObjectId(ownerId),
      },
      {
        $set: {
          role: 'owner',
          isDeleted: false,
          invitedBy: this.toObjectId(ownerId),
        },
        $setOnInsert: {
          joinedAt: new Date(),
        },
      },
      { upsert: true },
    ).exec();
  }

  async inviteMember(boardId: string, invitedByUserId: string, targetUserId: string): Promise<void> {
    const boardObjectId = this.toObjectId(boardId);
    const targetObjectId = this.toObjectId(targetUserId);
    const existing = await this.boardMemberModel.findOne({
      boardId: boardObjectId,
      userId: targetObjectId,
      isDeleted: { $ne: true },
    }).exec();
    if (existing) {
      return;
    }

    await this.boardMemberModel.updateOne(
      {
        boardId: boardObjectId,
        userId: targetObjectId,
      },
      {
        $set: {
          role: 'viewer',
          isDeleted: false,
          invitedBy: this.toObjectId(invitedByUserId),
        },
        $setOnInsert: {
          joinedAt: new Date(),
        },
      },
      { upsert: true },
    ).exec();
  }

  async updateMemberRole(
    boardId: string,
    actorUserId: string,
    targetUserId: string,
    role: BoardRole,
  ): Promise<void> {
    const boardObjectId = this.toObjectId(boardId);
    const targetObjectId = this.toObjectId(targetUserId);

    const target = await this.boardMemberModel.findOne({
      boardId: boardObjectId,
      userId: targetObjectId,
      isDeleted: { $ne: true },
    }).exec();

    if (!target) {
      throw new NotFoundException('Board member not found');
    }

    if (target.role === 'owner' && role !== 'owner') {
      const ownersCount = await this.boardMemberModel.countDocuments({
        boardId: boardObjectId,
        isDeleted: { $ne: true },
        role: 'owner',
      }).exec();
      if (ownersCount <= 1) {
        throw new BadRequestException('Cannot demote the last owner');
      }
    }

    if (actorUserId === targetUserId && target.role === 'owner' && role !== 'owner') {
      throw new BadRequestException('Owner cannot self-demote');
    }

    target.role = role;
    await target.save();
  }

  async removeMember(boardId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const boardObjectId = this.toObjectId(boardId);
    const targetObjectId = this.toObjectId(targetUserId);
    const actorRole = await this.getRole(actorUserId, boardId);
    if (!actorRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const target = await this.boardMemberModel.findOne({
      boardId: boardObjectId,
      userId: targetObjectId,
      isDeleted: { $ne: true },
    }).exec();
    if (!target) {
      throw new NotFoundException('Board member not found');
    }

    if (actorRole === 'editor' && target.role === 'owner') {
      throw new ForbiddenException('Editor cannot remove owner');
    }

    if (target.role === 'owner') {
      const ownersCount = await this.boardMemberModel.countDocuments({
        boardId: boardObjectId,
        isDeleted: { $ne: true },
        role: 'owner',
      }).exec();
      if (ownersCount <= 1) {
        throw new BadRequestException('Cannot remove the last owner');
      }
    }

    if (actorUserId === targetUserId && target.role === 'owner') {
      throw new BadRequestException('Owner cannot remove self');
    }

    target.isDeleted = true;
    await target.save();
  }
}
