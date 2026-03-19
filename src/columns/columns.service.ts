import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Column } from './column.schema';
import { Card } from '../cards/card.schema';
import { BoardsService } from '../boards/boards.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnItemDto } from './dto/reorder-columns.dto';
import { ColumnResponseDto } from '../boards/dto/column-response.dto';
import { CardResponseDto } from '../boards/dto/card-response.dto';

@Injectable()
export class ColumnsService {
  constructor(
    @InjectModel(Column.name)
    private readonly columnModel: Model<Column>,
    @InjectModel(Card.name)
    private readonly cardModel: Model<Card>,
    private readonly boardsService: BoardsService,
    private readonly eventsGateway: EventsGateway,
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

  private async getActiveColumnsForBoard(boardId: string): Promise<ColumnResponseDto[]> {
    const columns = await this.columnModel
      .find({ boardId: new Types.ObjectId(boardId), isDeleted: false })
      .sort({ order: 1 })
      .populate({
        path: 'cards',
        match: { isDeleted: false },
        options: { sort: { order: 1 } },
      })
      .exec();
    return columns.map((col) => this.toColumnResponse(col));
  }

  async create(dto: CreateColumnDto, userId: string): Promise<ColumnResponseDto> {
    await this.boardsService.findOne(dto.boardId, userId);

    const count = await this.columnModel
      .countDocuments({ boardId: new Types.ObjectId(dto.boardId), isDeleted: false })
      .exec();

    const column = new this.columnModel({
      title: dto.title,
      boardId: new Types.ObjectId(dto.boardId),
      order: count,
    });
    const saved = await column.save();

    const columns = await this.getActiveColumnsForBoard(dto.boardId);
    this.eventsGateway.emitColumnsUpdated(dto.boardId, columns);
    return this.toColumnResponse(saved);
  }

  async reorder(items: ReorderColumnItemDto[], userId: string): Promise<ColumnResponseDto[]> {
    if (items.length === 0) return [];

    const firstColumn = await this.columnModel
      .findById(items[0].id)
      .exec();
    if (!firstColumn) {
      throw new NotFoundException('Column not found');
    }
    const boardId = firstColumn.boardId.toString();
    await this.boardsService.findOne(boardId, userId);

    for (const item of items) {
      await this.columnModel
        .updateOne(
          { _id: new Types.ObjectId(item.id), boardId: new Types.ObjectId(boardId), isDeleted: false },
          { $set: { order: item.order } },
        )
        .exec();
    }

    const columns = await this.getActiveColumnsForBoard(boardId);
    this.eventsGateway.emitColumnsUpdated(boardId, columns);
    return columns;
  }

  async update(id: string, dto: UpdateColumnDto, userId: string): Promise<ColumnResponseDto> {
    const column = await this.columnModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .populate({
        path: 'cards',
        match: { isDeleted: false },
        options: { sort: { order: 1 } },
      })
      .exec();

    if (!column) {
      throw new NotFoundException('Column not found');
    }
    const boardId = column.boardId.toString();
    await this.boardsService.findOne(boardId, userId);

    const updated = await this.columnModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isDeleted: false },
        { $set: dto },
        { new: true },
      )
      .populate({
        path: 'cards',
        match: { isDeleted: false },
        options: { sort: { order: 1 } },
      })
      .exec();

    if (!updated) {
      throw new NotFoundException('Column not found');
    }

    const columns = await this.getActiveColumnsForBoard(boardId);
    this.eventsGateway.emitColumnsUpdated(boardId, columns);
    return this.toColumnResponse(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const column = await this.columnModel
      .findOne({ _id: new Types.ObjectId(id), isDeleted: false })
      .exec();

    if (!column) {
      throw new NotFoundException('Column not found');
    }
    const boardId = column.boardId.toString();
    await this.boardsService.findOne(boardId, userId);

    await this.columnModel
      .updateOne(
        { _id: new Types.ObjectId(id) },
        { $set: { isDeleted: true } },
      )
      .exec();

    await this.cardModel
      .updateMany(
        { columnId: new Types.ObjectId(id) },
        { $set: { isDeleted: true } },
      )
      .exec();

    const columns = await this.getActiveColumnsForBoard(boardId);
    this.eventsGateway.emitColumnsUpdated(boardId, columns);
  }

  async findAllByBoard(boardId: string, userId: string): Promise<ColumnResponseDto[]> {
    await this.boardsService.findOne(boardId, userId);
    return this.getActiveColumnsForBoard(boardId);
  }
}
