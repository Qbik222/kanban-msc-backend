import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Card extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Column', required: true })
  columnId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ default: 0 })
  order!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  assigneeId?: Types.ObjectId;

  @Prop({
    type: {
      startDate: { type: Date, required: false },
      endDate: { type: Date, required: false },
    },
    _id: false,
    required: false,
  })
  deadline?: {
    startDate?: Date;
    endDate?: Date;
  };

  @Prop({ type: [Types.ObjectId], default: [] })
  projectIds!: Types.ObjectId[];

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  })
  priority?: 'low' | 'medium' | 'high';

  @Prop({
    type: [
      {
        text: { type: String, required: true, trim: true },
        authorId: { type: Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  comments!: Array<{
    _id: Types.ObjectId;
    text: string;
    authorId: Types.ObjectId;
    createdAt: Date;
  }>;

  @Prop({ default: false })
  isDeleted!: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}

export const CardSchema = SchemaFactory.createForClass(Card);
