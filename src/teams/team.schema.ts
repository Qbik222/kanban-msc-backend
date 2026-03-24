import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Team extends Document {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ default: false })
  isDeleted!: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}

export const TeamSchema = SchemaFactory.createForClass(Team);

TeamSchema.index({ createdBy: 1 });
