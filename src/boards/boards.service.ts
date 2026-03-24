import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Board } from './board.schema';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { BoardResponseDto } from './dto/board-response.dto';
import { BoardDetailsResponseDto } from './dto/board-details-response.dto';
import { ColumnResponseDto } from './dto/column-response.dto';
import { CardResponseDto } from './dto/card-response.dto';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class BoardsService {
  constructor(
    @InjectModel(Board.name)
    private readonly boardModel: Model<Board>,
    private readonly permissionsService: PermissionsService,
  ) {}

  private mapId(value: unknown): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object' && value !== null && 'toString' in value) {
      return String((value as { toString: () => string }).toString());
    }
    return '';
  }

  private toCardResponse(card: any): CardResponseDto {
    return {
      id: this.mapId(card?._id ?? card?.id),
      title: card?.title ?? '',
      description: card?.description ?? '',
      order: card?.order ?? 0,
      columnId: this.mapId(card?.columnId),
      boardId: this.mapId(card?.boardId),
      isDeleted: Boolean(card?.isDeleted),
      assigneeId: card?.assigneeId ? this.mapId(card.assigneeId) : undefined,
      deadline: card?.deadline
        ? {
            startDate: card.deadline.startDate,
            endDate: card.deadline.endDate,
          }
        : undefined,
      projectIds: Array.isArray(card?.projectIds)
        ? card.projectIds.map((id: any) => this.mapId(id))
        : [],
      priority: card?.priority ?? 'medium',
      comments: Array.isArray(card?.comments)
        ? card.comments.map((c: any) => ({
            _id: this.mapId(c?._id ?? c?.id),
            text: c?.text ?? '',
            authorId: this.mapId(c?.authorId),
            createdAt: c?.createdAt,
          }))
        : [],
      createdAt: card?.createdAt,
      updatedAt: card?.updatedAt,
    };
  }

  private toColumnResponse(column: any): ColumnResponseDto {
    const cards = Array.isArray(column?.cards) ? column.cards : [];
    return {
      id: this.mapId(column?._id ?? column?.id),
      title: column?.title ?? '',
      order: column?.order ?? 0,
      boardId: this.mapId(column?.boardId),
      isDeleted: Boolean(column?.isDeleted),
      cards: cards.map((card: any) => this.toCardResponse(card)),
      createdAt: column?.createdAt,
      updatedAt: column?.updatedAt,
    };
  }

  private toBoardResponse(board: any): BoardResponseDto {
    return {
      id: this.mapId(board?._id ?? board?.id),
      title: board?.title ?? '',
      ownerId: this.mapId(board?.ownerId),
      teamId: this.mapId(board?.teamId),
      projectIds: Array.isArray(board?.projectIds)
        ? board.projectIds.map((id: any) => this.mapId(id))
        : [],
      isDeleted: Boolean(board?.isDeleted),
      createdAt: board?.createdAt,
      updatedAt: board?.updatedAt,
    };
  }

  private toBoardDetailsResponse(board: any): BoardDetailsResponseDto {
    const columns = Array.isArray(board?.columns) ? board.columns : [];
    return {
      ...this.toBoardResponse(board),
      columns: columns.map((column: any) => this.toColumnResponse(column)),
    };
  }

  async create(ownerId: string, dto: CreateBoardDto): Promise<BoardResponseDto> {
    const canCreate = await this.permissionsService.canCreateBoard(ownerId, dto.teamId);
    if (!canCreate) {
      throw new ForbiddenException('Only team admins can create boards');
    }

    const board = new this.boardModel({
      title: dto.title,
      ownerId: new Types.ObjectId(ownerId),
      teamId: new Types.ObjectId(dto.teamId),
      projectIds: (dto.projectIds ?? []).map((id) => new Types.ObjectId(id)),
    });
    const savedBoard = await board.save();
    await this.permissionsService.ensureOwnerMembership(savedBoard._id.toString(), ownerId);
    return this.toBoardResponse(savedBoard);
  }

  async findAllByOwner(ownerId: string): Promise<BoardResponseDto[]> {
    const boardIds = await this.permissionsService.getBoardIdsForUser(ownerId);
    if (boardIds.length === 0) {
      return [];
    }

    const boards = await this.boardModel
      .find({
        _id: { $in: boardIds.map((id) => new Types.ObjectId(id)) },
        isDeleted: false,
      })
      .sort({ updatedAt: -1 })
      .exec();
    return boards.map((board) => this.toBoardResponse(board));
  }

  async findOne(id: string, ownerId: string): Promise<BoardDetailsResponseDto> {
    await this.permissionsService.assertPermission(ownerId, id, 'board:read');

    const board = await this.boardModel
      .findOne({
        _id: new Types.ObjectId(id),
        isDeleted: false,
      })
      .populate({
        path: 'columns',
        match: { isDeleted: false },
        options: { sort: { order: 1 } },
        populate: {
          path: 'cards',
          match: { isDeleted: false },
          options: { sort: { order: 1 } },
        },
      })
      .exec();

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    return this.toBoardDetailsResponse(board);
  }

  async update(id: string, ownerId: string, dto: UpdateBoardDto): Promise<BoardResponseDto> {
    await this.permissionsService.assertPermission(ownerId, id, 'board:update');

    const board = await this.boardModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          isDeleted: false,
        },
        { $set: dto },
        { new: true },
      )
      .exec();

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    return this.toBoardResponse(board);
  }

  async remove(id: string, ownerId: string): Promise<BoardResponseDto> {
    await this.permissionsService.assertPermission(ownerId, id, 'board:delete');

    const board = await this.boardModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          isDeleted: false,
        },
        { $set: { isDeleted: true } },
        { new: true },
      )
      .exec();

    if (!board) {
      throw new NotFoundException('Board not found');
    }

    return this.toBoardResponse(board);
  }

  async inviteMember(boardId: string, actorUserId: string, targetUserId: string): Promise<void> {
    await this.permissionsService.assertPermission(actorUserId, boardId, 'member:invite');
    await this.permissionsService.inviteMember(boardId, actorUserId, targetUserId);
  }

  async updateMemberRole(
    boardId: string,
    actorUserId: string,
    targetUserId: string,
    role: 'owner' | 'editor' | 'viewer',
  ): Promise<void> {
    await this.permissionsService.assertPermission(actorUserId, boardId, 'member:update_role');
    await this.permissionsService.updateMemberRole(boardId, actorUserId, targetUserId, role);
  }

  async removeMember(boardId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const actorHasPermission = await this.permissionsService.hasPermission(
      actorUserId,
      boardId,
      'member:remove',
    );
    if (!actorHasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.permissionsService.removeMember(boardId, actorUserId, targetUserId);
  }
}
