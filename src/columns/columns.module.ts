import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Column, ColumnSchema } from './column.schema';
import { Card, CardSchema } from '../cards/card.schema';
import { ColumnsController } from './columns.controller';
import { ColumnsService } from './columns.service';
import { BoardsModule } from '../boards/boards.module';
import { EventsModule } from '../events/events.module';
import { PermissionsModule } from '../permissions';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Column.name, schema: ColumnSchema },
      { name: Card.name, schema: CardSchema },
    ]),
    BoardsModule,
    EventsModule,
    PermissionsModule,
  ],
  controllers: [ColumnsController],
  providers: [ColumnsService],
  exports: [ColumnsService],
})
export class ColumnsModule {}
