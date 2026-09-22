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
import { BoardMember } from '../permissions/board-member.schema';
import { BoardMemberResponseDto } from './dto/board-member-response.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { UsersService } from '../users/users.service';
import {
  collectCommentAuthorIdsFromColumns,
  mapColumnResponse,
} from '../cards/card-response.mapper';

@Injectable()
export class BoardsService {
  constructor(
    @InjectModel(Board.name)
    private readonly boardModel: Model<Board>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMember>,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
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

  private async toBoardDetailsResponse(board: any): Promise<BoardDetailsResponseDto> {
    const columns = Array.isArray(board?.columns) ? board.columns : [];
    const authorIds = collectCommentAuthorIdsFromColumns(columns);
    const authorsById = await this.usersService.findPublicProfilesByIds(authorIds);
    return {
      ...this.toBoardResponse(board),
      columns: columns.map((column: any) => mapColumnResponse(column, authorsById)),
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

    return await this.toBoardDetailsResponse(board);
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

  async listMembersForBoard(
    actorUserId: string,
    boardId: string,
  ): Promise<BoardMemberResponseDto[]> {
    // Membership check: only board members can view the members list.
    await this.permissionsService.assertPermission(actorUserId, boardId, 'board:read');

    const members = await this.boardMemberModel
      .find({ boardId: new Types.ObjectId(boardId), isDeleted: { $ne: true } })
      .populate('userId', 'email name')
      .exec();

    return members.map((m: any) => {
      const user = m.userId;
      return {
        id: this.mapId(user?._id ?? user?.id ?? ''),
        email: String(user?.email ?? ''),
        name: String(user?.name ?? ''),
        role: m.role,
      } satisfies BoardMemberResponseDto;
    });
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
