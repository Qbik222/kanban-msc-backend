import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Card } from './card.schema';
import { Column } from '../columns/column.schema';
import { BoardsService } from '../boards/boards.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CardResponseDto } from '../boards/dto/card-response.dto';
import {
  CardActivityEntryDto,
  CardActivityResponseDto,
} from './dto/card-activity.dto';
import { PermissionsService } from '../permissions';
import { CardActivityType } from './card.schema';
import { UsersService } from '../users/users.service';
import {
  collectCommentAuthorIds,
  mapCardResponse,
} from './card-response.mapper';

@Injectable()
export class CardsService {
  constructor(
    @InjectModel(Card.name)
    private readonly cardModel: Model<Card>,
    @InjectModel(Column.name)
    private readonly columnModel: Model<Column>,
    private readonly boardsService: BoardsService,
    private readonly eventsGateway: EventsGateway,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
  ) {}

  private mapId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'toString' in value) {
      return String((value as { toString: () => string }).toString());
    }
    return '';
  }

  private async toCardResponse(card: any): Promise<CardResponseDto> {
    const authorIds = collectCommentAuthorIds([card]);
    const authorsById = await this.usersService.findPublicProfilesByIds(authorIds);
    return mapCardResponse(card, authorsById);
  }

  async create(dto: CreateCardDto, userId: string): Promise<CardResponseDto> {
    const column = await this.columnModel
      .findOne({ _id: new Types.ObjectId(dto.columnId), isDeleted: false })
      .exec();
    if (!column) throw new NotFoundException('Column not found');

    const boardId = column.boardId.toString();
    await this.boardsService.findOne(boardId, userId);

    const count = await this.cardModel
      .countDocuments({ columnId: column._id, isDeleted: false })
      .exec();

    const created = await new this.cardModel({
      title: dto.title,
      description: dto.description ?? '',
      columnId: column._id,
      boardId: column.boardId,
      order: count, // 0-based to match existing columns/cards ordering in the project
      assigneeId: dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : undefined,
      deadline: dto.deadline
        ? { startDate: dto.deadline.startDate, endDate: dto.deadline.endDate }
        : undefined,
      projectIds: (dto.projectIds ?? []).map((id) => new Types.ObjectId(id)),
      priority: dto.priority ?? undefined,
      comments: [],
    }).save();

    const response = await this.toCardResponse(created);
    this.eventsGateway.emitCardCreated(boardId, response);
    return response;
  }

  private toActivityEntry(entry: any): CardActivityEntryDto {
    const type = entry?.type as CardActivityType;
    const base: CardActivityEntryDto = {
      _id: this.mapId(entry?._id ?? entry?.id),
      type,
      actorId: this.mapId(entry?.actorId),
      createdAt: entry?.createdAt,
    };

    if (type === 'deadline_changed' && entry?.deadline) {
      base.deadline = {
        from: entry.deadline.from
          ? {
              startDate: entry.deadline.from.startDate,
              endDate: entry.deadline.from.endDate,
            }
          : entry.deadline.from === null
            ? null
            : undefined,
        to: entry.deadline.to
          ? {
              startDate: entry.deadline.to.startDate,
              endDate: entry.deadline.to.endDate,
            }
          : entry.deadline.to === null
            ? null
            : undefined,
      };
    }

    if (type === 'assignee_changed' && entry?.assignee) {
      base.assignee = {
        fromUserId: entry.assignee.fromUserId
          ? this.mapId(entry.assignee.fromUserId)
          : entry.assignee.fromUserId === null
            ? null
            : undefined,
        toUserId: entry.assignee.toUserId
          ? this.mapId(entry.assignee.toUserId)
          : entry.assignee.toUserId === null
            ? null
            : undefined,
      };
    }

    if (type === 'description_changed' && entry?.description) {
      base.description = {
        from: entry.description.from ?? '',
        to: entry.description.to ?? '',
      };
    }

    if (type === 'priority_changed' && entry?.priority) {
      base.priority = {
        from: entry.priority.from ?? 'medium',
        to: entry.priority.to ?? 'medium',
      };
    }

    return base;
  }

  private normalizeDeadline(
    deadline?: { startDate?: Date; endDate?: Date } | null,
  ): { startDate?: string; endDate?: string } | null {
    if (!deadline) return null;
    const start = deadline.startDate ? new Date(deadline.startDate).toISOString() : undefined;
    const end = deadline.endDate ? new Date(deadline.endDate).toISOString() : undefined;
    if (!start && !end) return null;
    return { startDate: start, endDate: end };
  }

  private deadlinesEqual(
    a?: { startDate?: Date; endDate?: Date } | null,
    b?: { startDate?: Date; endDate?: Date } | null,
  ): boolean {
    const na = this.normalizeDeadline(a ?? null);
    const nb = this.normalizeDeadline(b ?? null);
    if (na === null && nb === null) return true;
    if (na === null || nb === null) return false;
    return na.startDate === nb.startDate && na.endDate === nb.endDate;
  }

  private buildActivityEntries(
    existing: Card,
    dto: UpdateCardDto,
    actorId: string,
  ): Array<Record<string, unknown>> {
    const now = new Date();
    const actorOid = new Types.ObjectId(actorId);
    const entries: Array<Record<string, unknown>> = [];

    if (dto.description !== undefined) {
      const from = existing.description ?? '';
      const to = dto.description;
      if (from !== to) {
        entries.push({
          type: 'description_changed',
          actorId: actorOid,
          createdAt: now,
          description: { from, to },
        });
      }
    }

    if (dto.assigneeId !== undefined) {
      const fromId = existing.assigneeId ? this.mapId(existing.assigneeId) : null;
      const toId = dto.assigneeId === null ? null : dto.assigneeId;
      if (fromId !== toId) {
        entries.push({
          type: 'assignee_changed',
          actorId: actorOid,
          createdAt: now,
          assignee: {
            fromUserId: fromId ? new Types.ObjectId(fromId) : null,
            toUserId: toId ? new Types.ObjectId(toId) : null,
          },
        });
      }
    }

    if (dto.deadline !== undefined) {
      const fromDeadline = existing.deadline ?? null;
      const toDeadline =
        dto.deadline === null
          ? null
          : { startDate: dto.deadline.startDate, endDate: dto.deadline.endDate };
      if (!this.deadlinesEqual(fromDeadline, toDeadline)) {
        entries.push({
          type: 'deadline_changed',
          actorId: actorOid,
          createdAt: now,
          deadline: {
            from: fromDeadline
              ? { startDate: fromDeadline.startDate, endDate: fromDeadline.endDate }
              : null,
            to: toDeadline,
          },
        });
      }
    }

    if (dto.priority !== undefined) {
      const from = (existing.priority ?? 'medium') as 'low' | 'medium' | 'high';
      const to = dto.priority;
      if (from !== to) {
        entries.push({
          type: 'priority_changed',
          actorId: actorOid,
          createdAt: now,
          priority: { from, to },
        });
      }
    }

    return entries;
  }

  async update(id: string, dto: UpdateCardDto, userId: string): Promise<CardResponseDto> {
    const existing = await this.cardModel.findOne({
      _id: new Types.ObjectId(id),
      isDeleted: false,
    }).exec();

    if (!existing) throw new NotFoundException('Card not found');

    const boardId = existing.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.boardsService.findOne(boardId, userId);

    const setPayload: Record<string, unknown> = {};
    const unsetPayload: Record<string, 1> = {};
    if (dto.title !== undefined) setPayload.title = dto.title;
    if (dto.description !== undefined) setPayload.description = dto.description;
    if (dto.assigneeId === null) {
      unsetPayload.assigneeId = 1;
    } else if (dto.assigneeId !== undefined) {
      setPayload.assigneeId = new Types.ObjectId(dto.assigneeId);
    }
    if (dto.deadline === null) {
      unsetPayload.deadline = 1;
    } else if (dto.deadline !== undefined) {
      setPayload.deadline = {
        startDate: dto.deadline.startDate,
        endDate: dto.deadline.endDate,
      };
    }
    if (dto.projectIds !== undefined) {
      setPayload.projectIds = dto.projectIds.map((pid) => new Types.ObjectId(pid));
    }
    if (dto.priority !== undefined) setPayload.priority = dto.priority;
    if (dto.taskComplete !== undefined) setPayload.taskComplete = dto.taskComplete;

    const activityEntries = this.buildActivityEntries(existing, dto, userId);

    const update: Record<string, unknown> = {};
    if (Object.keys(setPayload).length > 0) update.$set = setPayload;
    if (Object.keys(unsetPayload).length > 0) update.$unset = unsetPayload;
    if (activityEntries.length > 0) {
      update.$push = {
        activityLog: {
          $each: activityEntries,
          $slice: -100,
        },
      };
    }

    if (Object.keys(update).length === 0) {
      return await this.toCardResponse(existing);
    }

    const updated = await this.cardModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), isDeleted: false },
      update,
      { new: true },
    ).exec();

    if (!updated) throw new NotFoundException('Card not found');

    const response = await this.toCardResponse(updated);
    this.eventsGateway.emitCardUpdated(boardId, response);

    if (activityEntries.length > 0) {
      const log = Array.isArray(updated.activityLog) ? updated.activityLog : [];
      const newlyAdded = log.slice(-activityEntries.length).map((e) => this.toActivityEntry(e));
      this.eventsGateway.emitCardActivity(boardId, {
        cardId: response.id,
        items: newlyAdded,
      });
    }

    return response;
  }

  async getActivity(id: string, userId: string): Promise<CardActivityResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.boardsService.findOne(boardId, userId);

    const items = (Array.isArray(card.activityLog) ? card.activityLog : [])
      .map((e) => this.toActivityEntry(e))
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

    return { cardId: this.mapId(card._id), items };
  }

  async move(id: string, dto: MoveCardDto, userId: string): Promise<CardResponseDto> {
    const movedId = new Types.ObjectId(id);
    const movedCard = await this.cardModel
      .findOne({ _id: movedId, isDeleted: false })
      .exec();
    if (!movedCard) throw new NotFoundException('Card not found');

    const sourceColumnId = movedCard.columnId;
    const targetColumn = await this.columnModel
      .findOne({ _id: new Types.ObjectId(dto.targetColumnId), isDeleted: false })
      .exec();
    if (!targetColumn) throw new NotFoundException('Target column not found');

    const targetColumnId = targetColumn._id;
    const boardObjectId = targetColumn.boardId;
    const boardId = boardObjectId.toString();

    // Ensure both columns belong to the same board (cards should not be moved across boards)
    const sourceBoardId = movedCard.boardId?.toString();
    if (sourceBoardId && sourceBoardId !== boardId) {
      throw new BadRequestException('Cannot move card across different boards');
    }

    await this.boardsService.findOne(boardId, userId);

    const newOrderClampedWithin = (len: number) =>
      Math.max(0, Math.min(dto.newOrder, len));

    if (sourceColumnId.equals(targetColumnId)) {
      // Reorder inside the same column
      const otherCards = await this.cardModel
        .find({ columnId: sourceColumnId, isDeleted: false, _id: { $ne: movedId } })
        .sort({ order: 1 })
        .exec();

      const insertIndex = newOrderClampedWithin(otherCards.length);
      const desired = [
        ...otherCards.slice(0, insertIndex),
        movedCard,
        ...otherCards.slice(insertIndex),
      ];

      const ops = desired.map((c, idx) => ({
        updateOne: {
          filter: { _id: c._id },
          update: { $set: { order: idx, columnId: sourceColumnId, boardId: boardObjectId } },
        },
      }));
      await this.cardModel.bulkWrite(ops);
    } else {
      // Move between two columns
      const sourceCards = await this.cardModel
        .find({ columnId: sourceColumnId, isDeleted: false, _id: { $ne: movedId } })
        .sort({ order: 1 })
        .exec();

      const targetCards = await this.cardModel
        .find({ columnId: targetColumnId, isDeleted: false })
        .sort({ order: 1 })
        .exec();

      const insertIndex = newOrderClampedWithin(targetCards.length);
      const desiredTarget = [
        ...targetCards.slice(0, insertIndex),
        movedCard,
        ...targetCards.slice(insertIndex),
      ];

      const ops: any[] = [];

      // Recalculate source column
      sourceCards.forEach((c, idx) => {
        ops.push({
          updateOne: {
            filter: { _id: c._id },
            update: { $set: { order: idx } },
          },
        });
      });

      // Recalculate target column and update moved card position
      desiredTarget.forEach((c, idx) => {
        ops.push({
          updateOne: {
            filter: { _id: c._id },
            update: {
              $set: {
                order: idx,
                columnId: targetColumnId,
                boardId: boardObjectId,
              },
            },
          },
        });
      });

      await this.cardModel.bulkWrite(ops);
    }

    const updatedMoved = await this.cardModel
      .findOne({ _id: movedId, isDeleted: false })
      .exec();
    if (!updatedMoved) throw new NotFoundException('Card not found after move');

    // Full snapshot for UI consistency
    const boardSnapshot = await this.boardsService.findOne(boardId, userId);
    this.eventsGateway.emitCardMoved(boardId, boardSnapshot);

    return await this.toCardResponse(updatedMoved);
  }

  async addComment(id: string, dto: AddCommentDto, userId: string): Promise<CardResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.boardsService.findOne(boardId, userId);

    if (dto.parentCommentId) {
      const parent = (card.comments ?? []).find(
        (c: any) => this.mapId(c?._id ?? c?.id) === dto.parentCommentId,
      );
      if (!parent) {
        throw new BadRequestException('Parent comment not found');
      }
    }

    const author = await this.usersService.findById(userId);
    const commentPayload: Record<string, unknown> = {
      text: dto.text,
      authorId: new Types.ObjectId(userId),
      authorName: author.name,
      authorAvatarUrl: author.avatarUrl,
      createdAt: new Date(),
    };
    if (dto.parentCommentId) {
      commentPayload.parentCommentId = new Types.ObjectId(dto.parentCommentId);
    }

    const updated = await this.cardModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        { $push: { comments: commentPayload } },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('Card not found');

    const response = await this.toCardResponse(updated);
    this.eventsGateway.emitCommentAdded(boardId, response);
    return response;
  }

  async updateComment(
    id: string,
    commentId: string,
    dto: UpdateCommentDto,
    userId: string,
  ): Promise<CardResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.boardsService.findOne(boardId, userId);

    const canUpdateAny = await this.permissionsService.hasPermission(
      userId,
      boardId,
      'comment:update:any',
    );
    if (!canUpdateAny) {
      const targetComment = (card.comments ?? []).find((comment: any) => {
        const existingId = this.mapId(comment?._id ?? comment?.id);
        return existingId === commentId;
      });
      const isOwnComment = targetComment
        && this.mapId((targetComment as any).authorId) === userId;
      const canUpdateOwn = await this.permissionsService.hasPermission(
        userId,
        boardId,
        'comment:update:own',
      );
      if (!isOwnComment || !canUpdateOwn) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    const updated = await this.cardModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          isDeleted: false,
          'comments._id': new Types.ObjectId(commentId),
        },
        { $set: { 'comments.$.text': dto.text } },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('Comment not found');

    const response = await this.toCardResponse(updated);
    this.eventsGateway.emitCommentUpdated(boardId, response);
    return response;
  }

  async deleteComment(id: string, commentId: string, userId: string): Promise<CardResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.boardsService.findOne(boardId, userId);

    const canDeleteAny = await this.permissionsService.hasPermission(
      userId,
      boardId,
      'comment:delete:any',
    );
    if (!canDeleteAny) {
      const targetComment = (card.comments ?? []).find((comment: any) => {
        const existingId = this.mapId(comment?._id ?? comment?.id);
        return existingId === commentId;
      });
      const isOwnComment = targetComment
        && this.mapId((targetComment as any).authorId) === userId;
      const canDeleteOwn = await this.permissionsService.hasPermission(
        userId,
        boardId,
        'comment:delete:own',
      );
      if (!isOwnComment || !canDeleteOwn) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    const updated = await this.cardModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        { $pull: { comments: { _id: new Types.ObjectId(commentId) } } },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('Card not found');

    const response = await this.toCardResponse(updated);
    // Keep clients in sync after comment delete (closest existing event is card_updated)
    this.eventsGateway.emitCardUpdated(boardId, response);

    return response;
  }

  async remove(id: string, userId: string): Promise<CardResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.permissionsService.assertPermission(userId, boardId, 'card:delete');

    const deleted = await this.cardModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        { $set: { isDeleted: true } },
        { new: true },
      )
      .exec();
    if (!deleted) throw new NotFoundException('Card not found');

    const activeCards = await this.cardModel
      .find({ columnId: card.columnId, isDeleted: false })
      .sort({ order: 1 })
      .exec();

    if (activeCards.length > 0) {
      const ops = activeCards.map((current, idx) => ({
        updateOne: {
          filter: { _id: current._id },
          update: { $set: { order: idx } },
        },
      }));
      await this.cardModel.bulkWrite(ops);
    }

    const snapshot = await this.boardsService.findOne(boardId, userId);
    this.eventsGateway.emitCardMoved(boardId, snapshot);
    return await this.toCardResponse(deleted);
  }

  async restore(id: string, userId: string): Promise<CardResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: true })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.permissionsService.assertPermission(userId, boardId, 'card:delete');

    const column = await this.columnModel
      .findOne({ _id: card.columnId, isDeleted: false })
      .exec();
    if (!column) {
      throw new BadRequestException('Column not found or deleted');
    }

    const order = await this.cardModel
      .countDocuments({ columnId: card.columnId, isDeleted: false })
      .exec();

    const restored = await this.cardModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: true },
        { $set: { isDeleted: false, order } },
        { new: true },
      )
      .exec();
    if (!restored) throw new NotFoundException('Card not found');

    const snapshot = await this.boardsService.findOne(boardId, userId);
    this.eventsGateway.emitCardMoved(boardId, snapshot);
    return await this.toCardResponse(restored);
  }

  async removePermanent(id: string, userId: string): Promise<void> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id) })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.permissionsService.assertPermission(userId, boardId, 'card:purge');

    const wasActive = card.isDeleted !== true;
    const columnId = card.columnId;

    const deleted = await this.cardModel
      .findOneAndDelete({ _id: new Types.ObjectId(id) })
      .exec();
    if (!deleted) throw new NotFoundException('Card not found');

    if (wasActive) {
      const activeCards = await this.cardModel
        .find({ columnId, isDeleted: false })
        .sort({ order: 1 })
        .exec();

      if (activeCards.length > 0) {
        const ops = activeCards.map((current, idx) => ({
          updateOne: {
            filter: { _id: current._id },
            update: { $set: { order: idx } },
          },
        }));
        await this.cardModel.bulkWrite(ops);
      }
    }

    const snapshot = await this.boardsService.findOne(boardId, userId);
    this.eventsGateway.emitCardMoved(boardId, snapshot);
  }
}

