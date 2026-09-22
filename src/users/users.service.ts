import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  private escapeRegExp(value: string): string {
    // Escapes regex special characters so user input is treated as a plain substring.
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const createdUser = new this.userModel({
      ...dto,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
    });

    return createdUser.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findPublicProfilesByIds(
    ids: string[],
  ): Promise<Map<string, { id: string; name: string; avatarUrl?: string }>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const map = new Map<string, { id: string; name: string; avatarUrl?: string }>();
    if (unique.length === 0) return map;

    const objectIds = unique
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) return map;

    const users = await this.userModel
      .find({ _id: { $in: objectIds } })
      .select({ name: 1, avatarUrl: 1 })
      .exec();

    for (const u of users) {
      const id = String(u._id);
      map.set(id, {
        id,
        name: String(u.name ?? 'Unknown'),
        avatarUrl: u.avatarUrl ? String(u.avatarUrl) : undefined,
      });
    }
    return map;
  }

  async searchByEmailContains(
    query: string,
    limit = 10,
  ): Promise<Array<{ id: string; email: string; name: string }>> {
    const escaped = this.escapeRegExp(query);

    const users = await this.userModel
      .find({
        email: { $regex: escaped, $options: 'i' },
      })
      .limit(limit)
      .select({ email: 1, name: 1 })
      .exec();

    return users.map((u: User) => ({
      id: String(u._id),
      email: String(u.email),
      name: String(u.name),
    }));
  }
}

