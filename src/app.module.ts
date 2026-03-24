
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { ColumnsModule } from './columns/columns.module';
import { CardsModule } from './cards/cards.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/kanban',
    ),
    UsersModule,
    AuthModule,
    TeamsModule,
    BoardsModule,
    ColumnsModule,
    CardsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
