
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // Базове підключення до MongoDB (локальний Docker або встановлена Mongo)
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/kanban',
    ),
    UsersModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
