import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RefreshSession } from './schemas/refresh-session.schema';

@Injectable()
export class RefreshSessionsService {
  constructor(
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSession>,
  ) {}

  async createSession(params: {
    jti: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshSession> {
    const doc = new this.refreshSessionModel({
      jti: params.jti,
      userId: new Types.ObjectId(params.userId),
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
    });
    return doc.save();
  }

  async findActiveByJtiAndHash(
    jti: string,
    tokenHash: string,
  ): Promise<RefreshSession | null> {
    return this.refreshSessionModel
      .findOne({
        jti,
        tokenHash,
        revokedAt: { $exists: false },
      })
      .exec();
  }

  async findByJti(jti: string): Promise<RefreshSession | null> {
    return this.refreshSessionModel.findOne({ jti }).exec();
  }

  async revokeSession(
    sessionId: string,
    replacedBy?: Types.ObjectId,
  ): Promise<void> {
    await this.refreshSessionModel
      .updateOne(
        { _id: new Types.ObjectId(sessionId) },
        {
          $set: {
            revokedAt: new Date(),
            ...(replacedBy ? { replacedBy } : {}),
          },
        },
      )
      .exec();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshSessionModel
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }
}
