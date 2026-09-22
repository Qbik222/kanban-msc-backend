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
import { UsersService } from '../users/users.service';
import {
  collectCommentAuthorIdsFromColumns,
  mapColumnResponse,
} from '../cards/card-response.mapper';

@Injectable()
export class ColumnsService {
  constructor(
    @InjectModel(Column.name)
    private readonly columnModel: Model<Column>,
    @InjectModel(Card.name)
    private readonly cardModel: Model<Card>,
    private readonly boardsService: BoardsService,
    private readonly eventsGateway: EventsGateway,
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
    const authorIds = collectCommentAuthorIdsFromColumns(columns);
    const authorsById = await this.usersService.findPublicProfilesByIds(authorIds);
    return columns.map((col) => mapColumnResponse(col, authorsById));
  }

  private toColumnResponseLite(column: any): ColumnResponseDto {
    return mapColumnResponse(column, new Map());
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
    return this.toColumnResponseLite(saved);
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
    return mapColumnResponse(updated, new Map());
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
