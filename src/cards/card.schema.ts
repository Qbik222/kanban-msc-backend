import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CardActivityType =
  | 'deadline_changed'
  | 'assignee_changed'
  | 'description_changed'
  | 'priority_changed';

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

  @Prop({ required: false, default: '', trim: true })
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

  @Prop({ type: Boolean, required: true, default: false })
  taskComplete!: boolean;

  @Prop({
    type: [
      {
        text: { type: String, required: true, trim: true },
        authorId: { type: Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, required: false, trim: true },
        authorAvatarUrl: { type: String, required: false },
        parentCommentId: { type: Types.ObjectId, required: false },
        createdAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  comments!: Array<{
    _id: Types.ObjectId;
    text: string;
    authorId: Types.ObjectId;
    authorName?: string;
    authorAvatarUrl?: string;
    parentCommentId?: Types.ObjectId;
    createdAt: Date;
  }>;

  @Prop({
    type: [
      {
        type: {
          type: String,
          enum: ['deadline_changed', 'assignee_changed', 'description_changed', 'priority_changed'],
          required: true,
        },
        actorId: { type: Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: () => new Date() },
        deadline: {
          type: {
            from: {
              type: {
                startDate: { type: Date, required: false },
                endDate: { type: Date, required: false },
              },
              _id: false,
              required: false,
            },
            to: {
              type: {
                startDate: { type: Date, required: false },
                endDate: { type: Date, required: false },
              },
              _id: false,
              required: false,
            },
          },
          _id: false,
          required: false,
        },
        assignee: {
          type: {
            fromUserId: { type: Types.ObjectId, ref: 'User', required: false },
            toUserId: { type: Types.ObjectId, ref: 'User', required: false },
          },
          _id: false,
          required: false,
        },
        description: {
          type: {
            from: { type: String, required: true },
            to: { type: String, required: true },
          },
          _id: false,
          required: false,
        },
        priority: {
          type: {
            from: { type: String, enum: ['low', 'medium', 'high'], required: true },
            to: { type: String, enum: ['low', 'medium', 'high'], required: true },
          },
          _id: false,
          required: false,
        },
      },
    ],
    default: [],
  })
  activityLog!: Array<{
    _id: Types.ObjectId;
    type: CardActivityType;
    actorId: Types.ObjectId;
    createdAt: Date;
    deadline?: {
      from?: { startDate?: Date; endDate?: Date } | null;
      to?: { startDate?: Date; endDate?: Date } | null;
    };
    assignee?: {
      fromUserId?: Types.ObjectId | null;
      toUserId?: Types.ObjectId | null;
    };
    description?: {
      from: string;
      to: string;
    };
    priority?: {
      from: 'low' | 'medium' | 'high';
      to: 'low' | 'medium' | 'high';
    };
  }>;

  @Prop({ default: false })
  isDeleted!: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}

export const CardSchema = SchemaFactory.createForClass(Card);
