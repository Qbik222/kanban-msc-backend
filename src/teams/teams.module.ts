import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { Board, BoardSchema } from '../boards/board.schema';
import { BoardMember, BoardMemberSchema } from '../permissions/board-member.schema';
import { Team, TeamSchema } from './team.schema';
import { TeamMember, TeamMemberSchema } from './team-member.schema';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Team.name, schema: TeamSchema },
      { name: TeamMember.name, schema: TeamMemberSchema },
      { name: Board.name, schema: BoardSchema },
      { name: BoardMember.name, schema: BoardMemberSchema },
    ]),
  ],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService, MongooseModule],
})
export class TeamsModule {}
