import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'refreshsessions',
  timestamps: true,
})
export class RefreshSession extends Document {
  @Prop({ required: true, unique: true, index: true })
  jti!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'RefreshSession' })
  replacedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);

RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
