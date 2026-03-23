import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BOARD_ROLES, BoardRole } from './permissions.constants';

@Schema({
  timestamps: true,
})
export class BoardMember extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: BOARD_ROLES, required: true })
  role!: BoardRole;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  invitedBy?: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() })
  joinedAt!: Date;

  @Prop({ default: false })
  isDeleted!: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);

BoardMemberSchema.index({ boardId: 1, userId: 1 }, { unique: true });
BoardMemberSchema.index({ userId: 1, isDeleted: 1 });
