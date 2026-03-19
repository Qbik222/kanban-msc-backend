import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Board, BoardSchema } from './board.schema';
import { Column, ColumnSchema } from '../columns/column.schema';
import { Card, CardSchema } from '../cards/card.schema';
import { BoardsController, BoardsService } from './index';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    EventsModule,
    MongooseModule.forFeature([
      { name: Board.name, schema: BoardSchema },
      { name: Column.name, schema: ColumnSchema },
      { name: Card.name, schema: CardSchema },
    ]),
  ],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}
