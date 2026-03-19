import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Board extends Document {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId!: Types.ObjectId;

  @Prop({ default: false })
  isDeleted!: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}

export const BoardSchema = SchemaFactory.createForClass(Board);

BoardSchema.virtual('columns', {
  ref: 'Column',
  localField: '_id',
  foreignField: 'boardId',
});

BoardSchema.set('toJSON', { virtuals: true });
BoardSchema.set('toObject', { virtuals: true });
