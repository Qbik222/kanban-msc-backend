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
import { TeamMember } from '../teams/team-member.schema';
import { TeamRole } from '../teams/team.constants';
import { BoardRole, Permission, ROLE_PERMISSIONS } from './permissions.constants';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMember>,
    @InjectModel(TeamMember.name)
    private readonly teamMemberModel: Model<TeamMember>,
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

  async canCreateBoard(userId: string, teamId: string): Promise<boolean> {
    const role = await this.getTeamMembershipRole(userId, teamId);
    return role === 'admin';
  }

  private async getTeamMembershipRole(userId: string, teamId: string): Promise<TeamRole | null> {
    const m = await this.teamMemberModel
      .findOne({
        teamId: this.toObjectId(teamId),
        userId: this.toObjectId(userId),
        isDeleted: { $ne: true },
      })
      .exec();
    return m?.role ?? null;
  }

  private async getBoardRoleForTeamUser(
    userId: string,
    board: Board,
  ): Promise<BoardRole | null> {
    if (board.ownerId.toString() === userId) {
      return 'owner';
    }

    const member = await this.boardMemberModel.findOne({
      boardId: board._id,
      userId: this.toObjectId(userId),
      isDeleted: { $ne: true },
    }).exec();

    return member?.role ?? null;
  }

  private async getRole(userId: string, boardId: string): Promise<BoardRole | null> {
    const boardObjectId = this.toObjectId(boardId);
    const userObjectId = this.toObjectId(userId);

    const board = await this.boardModel.findOne({
      _id: boardObjectId,
    }).exec();

    if (!board) {
      return null;
    }

    const teamMember = await this.teamMemberModel.findOne({
      teamId: board.teamId,
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).exec();

    if (!teamMember) {
      return null;
    }

    if (teamMember.role === 'admin') {
      return 'owner';
    }

    return this.getBoardRoleForTeamUser(userId, board);
  }

  async hasPermission(userId: string, boardId: string, permission: Permission): Promise<boolean> {
    const boardObjectId = this.toObjectId(boardId);
    const userObjectId = this.toObjectId(userId);

    const board = await this.boardModel.findOne({
      _id: boardObjectId,
    }).exec();

    if (!board) {
      return false;
    }

    const teamMember = await this.teamMemberModel.findOne({
      teamId: board.teamId,
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).exec();

    if (!teamMember) {
      return false;
    }

    if (teamMember.role === 'admin') {
      return true;
    }

    const boardRole = await this.getBoardRoleForTeamUser(userId, board);
    if (!boardRole) {
      return false;
    }
    return ROLE_PERMISSIONS[boardRole].has(permission);
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

    const teamMemberships = await this.teamMemberModel.find({
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).exec();

    if (teamMemberships.length === 0) {
      return [];
    }

    const teamRoleById = new Map<string, TeamRole>();
    const allTeamIds: Types.ObjectId[] = [];
    for (const m of teamMemberships) {
      teamRoleById.set(m.teamId.toString(), m.role);
      allTeamIds.push(m.teamId);
    }

    const boardsInTeams = await this.boardModel
      .find({
        teamId: { $in: allTeamIds },
        isDeleted: { $ne: true },
      })
      .select({ _id: 1, teamId: 1, ownerId: 1 })
      .exec();

    const memberRows = await this.boardMemberModel.find({
      userId: userObjectId,
      isDeleted: { $ne: true },
    }).select({ boardId: 1 }).exec();
    const memberBoardIds = new Set(memberRows.map((r) => r.boardId.toString()));

    const result = new Set<string>();
    for (const b of boardsInTeams) {
      const tid = b.teamId.toString();
      const role = teamRoleById.get(tid);
      if (!role) {
        continue;
      }

      const bid = b._id.toString();
      if (role === 'admin') {
        result.add(bid);
      } else if (b.ownerId.toString() === userId || memberBoardIds.has(bid)) {
        result.add(bid);
      }
    }

    return Array.from(result);
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

    const board = await this.boardModel.findOne({
      _id: boardObjectId,
      isDeleted: { $ne: true },
    }).exec();
    if (!board) {
      throw new NotFoundException('Board not found');
    }

    const targetInTeam = await this.teamMemberModel.findOne({
      teamId: board.teamId,
      userId: targetObjectId,
      isDeleted: { $ne: true },
    }).exec();
    if (!targetInTeam) {
      throw new ForbiddenException('User is not a member of this team');
    }

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
