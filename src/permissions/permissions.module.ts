import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Board, BoardSchema } from '../boards/board.schema';
import { Card, CardSchema } from '../cards/card.schema';
import { Column, ColumnSchema } from '../columns/column.schema';
import { BoardMember, BoardMemberSchema } from './board-member.schema';
import { TeamMember, TeamMemberSchema } from '../teams/team-member.schema';
import { PermissionsService } from './permissions.service';
import { BoardPermissionGuard } from './board-permission.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BoardMember.name, schema: BoardMemberSchema },
      { name: TeamMember.name, schema: TeamMemberSchema },
      { name: Board.name, schema: BoardSchema },
      { name: Column.name, schema: ColumnSchema },
      { name: Card.name, schema: CardSchema },
    ]),
  ],
  providers: [PermissionsService, BoardPermissionGuard],
  exports: [PermissionsService, BoardPermissionGuard, MongooseModule],
})
export class PermissionsModule {}
