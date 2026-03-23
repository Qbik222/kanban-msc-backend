import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { RefreshSessionsService } from './refresh-sessions.service';
import {
  RefreshSession,
  RefreshSessionSchema,
} from './schemas/refresh-session.schema';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    MongooseModule.forFeature([
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_jwt_secret',
    }),
  ],
  providers: [AuthService, JwtStrategy, RefreshSessionsService],
  controllers: [AuthController],
})
export class AuthModule {}

