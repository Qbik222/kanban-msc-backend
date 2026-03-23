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
import { CardResponseDto } from '../boards/dto/card-response.dto';
import { PermissionsService } from '../permissions';

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
  ) {}

  private mapId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
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
      assigneeId: card?.assigneeId ? this.mapId(card?.assigneeId) : undefined,
      deadline: card?.deadline
        ? { startDate: card.deadline.startDate, endDate: card.deadline.endDate }
        : undefined,
      projectIds: Array.isArray(card?.projectIds)
        ? card.projectIds.map((id: any) => this.mapId(id))
        : [],
      priority: card?.priority ?? 'medium',
      comments: Array.isArray(card?.comments)
        ? (card.comments as any[]).map((c) => ({
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
      description: dto.description,
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

    const response = this.toCardResponse(created);
    this.eventsGateway.emitCardCreated(boardId, response);
    return response;
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

    const updatePayload: any = {};
    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.description !== undefined) updatePayload.description = dto.description;
    if (dto.assigneeId !== undefined) updatePayload.assigneeId = new Types.ObjectId(dto.assigneeId);
    if (dto.deadline !== undefined) {
      updatePayload.deadline = dto.deadline
        ? { startDate: dto.deadline.startDate, endDate: dto.deadline.endDate }
        : undefined;
    }
    if (dto.projectIds !== undefined) {
      updatePayload.projectIds = dto.projectIds.map((pid) => new Types.ObjectId(pid));
    }
    if (dto.priority !== undefined) updatePayload.priority = dto.priority;

    const updated = await this.cardModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), isDeleted: false },
      { $set: updatePayload },
      { new: true },
    ).exec();

    if (!updated) throw new NotFoundException('Card not found');

    const response = this.toCardResponse(updated);
    this.eventsGateway.emitCardUpdated(boardId, response);
    return response;
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

    return this.toCardResponse(updatedMoved);
  }

  async addComment(id: string, dto: AddCommentDto, userId: string): Promise<CardResponseDto> {
    const card = await this.cardModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();
    if (!card) throw new NotFoundException('Card not found');

    const boardId = card.boardId?.toString();
    if (!boardId) throw new BadRequestException('Card boardId is missing');

    await this.boardsService.findOne(boardId, userId);

    const updated = await this.cardModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        {
          $push: {
            comments: {
              text: dto.text,
              authorId: new Types.ObjectId(userId),
              createdAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('Card not found');

    const response = this.toCardResponse(updated);
    this.eventsGateway.emitCommentAdded(boardId, response);
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

    const response = this.toCardResponse(updated);
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
    return this.toCardResponse(deleted);
  }
}

