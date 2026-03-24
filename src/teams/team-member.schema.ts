import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TEAM_ROLES, TeamRole } from './team.constants';

@Schema({
  timestamps: true,
})
export class TeamMember extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Team', required: true, index: true })
  teamId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: TEAM_ROLES, required: true })
  role!: TeamRole;

  @Prop({ default: false })
  isDeleted!: boolean;

  createdAt?: Date;

  updatedAt?: Date;
}

export const TeamMemberSchema = SchemaFactory.createForClass(TeamMember);

TeamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
TeamMemberSchema.index({ userId: 1, isDeleted: 1 });
