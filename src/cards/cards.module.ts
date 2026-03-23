import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Card, CardSchema } from './card.schema';
import { Column, ColumnSchema } from '../columns/column.schema';
import { BoardsModule } from '../boards/boards.module';
import { EventsModule } from '../events/events.module';
import { PermissionsModule } from '../permissions';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Card.name, schema: CardSchema },
      { name: Column.name, schema: ColumnSchema },
    ]),
    BoardsModule,
    EventsModule,
    PermissionsModule,
  ],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}

