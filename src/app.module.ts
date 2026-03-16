import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Базове підключення до MongoDB (локальний Docker або встановлена Mongo)
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/kanban',
    ),
  ],
  controllers: [HealthController],
})
export class AppModule {}

