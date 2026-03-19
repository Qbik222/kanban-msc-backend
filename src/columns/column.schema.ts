import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Column extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true })
  boardId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ default: 0 })
  order!: number;

  createdAt?: Date;

  updatedAt?: Date;
}

export const ColumnSchema = SchemaFactory.createForClass(Column);

ColumnSchema.virtual('cards', {
  ref: 'Card',
  localField: '_id',
  foreignField: 'columnId',
});

ColumnSchema.set('toJSON', { virtuals: true });
ColumnSchema.set('toObject', { virtuals: true });
