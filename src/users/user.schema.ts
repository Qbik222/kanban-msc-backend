import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class User extends Document {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({ required: true })
  password!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop()
  avatarUrl?: string;

  createdAt?: Date;

  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, __v, ...rest } = ret;
    return rest;
  },
});

