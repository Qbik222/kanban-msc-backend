import {
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

@Injectable()
export class BoardsService {
  constructor(
    @InjectModel(Board.name)
    private readonly boardModel: Model<Board>,
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
      order: card?.order ?? 0,
      columnId: this.mapId(card?.columnId),
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
    const board = new this.boardModel({
      title: dto.title,
      ownerId: new Types.ObjectId(ownerId),
    });
    const savedBoard = await board.save();
    return this.toBoardResponse(savedBoard);
  }

  async findAllByOwner(ownerId: string): Promise<BoardResponseDto[]> {
    const boards = await this.boardModel
      .find({
        ownerId: new Types.ObjectId(ownerId),
        isDeleted: false,
      })
      .sort({ updatedAt: -1 })
      .exec();
    return boards.map((board) => this.toBoardResponse(board));
  }

  async findOne(id: string, ownerId: string): Promise<BoardDetailsResponseDto> {
    const board = await this.boardModel
      .findOne({
        _id: new Types.ObjectId(id),
        ownerId: new Types.ObjectId(ownerId),
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
    const board = await this.boardModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ownerId: new Types.ObjectId(ownerId),
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
    const board = await this.boardModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ownerId: new Types.ObjectId(ownerId),
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
}
