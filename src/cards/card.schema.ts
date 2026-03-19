import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Card extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Column', required: true })
  columnId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ default: 0 })
  order!: number;

  createdAt?: Date;

  updatedAt?: Date;
}

export const CardSchema = SchemaFactory.createForClass(Card);
