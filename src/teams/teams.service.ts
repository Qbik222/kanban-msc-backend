import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { Team } from './team.schema';
import { TeamMember } from './team-member.schema';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import { TeamRole } from './team.constants';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name)
    private readonly teamModel: Model<Team>,
    @InjectModel(TeamMember.name)
    private readonly teamMemberModel: Model<TeamMember>,
    private readonly usersService: UsersService,
  ) {}

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return new Types.ObjectId(id);
  }

  private mapTeam(team: any): TeamResponseDto {
    return {
      id: String(team?._id ?? team?.id),
      name: team?.name ?? '',
      createdBy: String(team?.createdBy),
      isDeleted: Boolean(team?.isDeleted),
      createdAt: team?.createdAt,
      updatedAt: team?.updatedAt,
    };
  }

  async create(userId: string, dto: CreateTeamDto): Promise<TeamResponseDto> {
    const team = await this.teamModel.create({
      name: dto.name.trim(),
      createdBy: this.toObjectId(userId),
    });

    await this.teamMemberModel.create({
      teamId: team._id,
      userId: this.toObjectId(userId),
      role: 'admin',
      isDeleted: false,
    });

    return this.mapTeam(team);
  }

  async findAllForUser(userId: string): Promise<TeamResponseDto[]> {
    const userOid = this.toObjectId(userId);
    const memberships = await this.teamMemberModel
      .find({ userId: userOid, isDeleted: { $ne: true } })
      .select({ teamId: 1 })
      .exec();

    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) {
      return [];
    }

    const teams = await this.teamModel
      .find({
        _id: { $in: teamIds },
        isDeleted: { $ne: true },
      })
      .sort({ updatedAt: -1 })
      .exec();

    return teams.map((t) => this.mapTeam(t));
  }

  async getTeamRole(userId: string, teamId: string): Promise<TeamRole | null> {
    const m = await this.teamMemberModel
      .findOne({
        teamId: this.toObjectId(teamId),
        userId: this.toObjectId(userId),
        isDeleted: { $ne: true },
      })
      .exec();
    return m?.role ?? null;
  }

  async assertTeamAdmin(userId: string, teamId: string): Promise<void> {
    const role = await this.getTeamRole(userId, teamId);
    if (role !== 'admin') {
      throw new ForbiddenException('Team admin only');
    }
  }

  async inviteMember(
    teamId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertTeamAdmin(actorUserId, teamId);
    if (actorUserId === targetUserId) {
      throw new BadRequestException('Cannot invite yourself');
    }

    await this.usersService.findById(targetUserId);

    await this.teamMemberModel.updateOne(
      {
        teamId: this.toObjectId(teamId),
        userId: this.toObjectId(targetUserId),
      },
      {
        $set: {
          role: 'user',
          isDeleted: false,
        },
      },
      { upsert: true },
    ).exec();
  }

  async updateMemberRole(
    teamId: string,
    actorUserId: string,
    targetUserId: string,
    role: TeamRole,
  ): Promise<void> {
    await this.assertTeamAdmin(actorUserId, teamId);

    const target = await this.teamMemberModel
      .findOne({
        teamId: this.toObjectId(teamId),
        userId: this.toObjectId(targetUserId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!target) {
      throw new NotFoundException('Team member not found');
    }

    if (target.role === 'admin' && role !== 'admin') {
      const admins = await this.teamMemberModel.countDocuments({
        teamId: this.toObjectId(teamId),
        isDeleted: { $ne: true },
        role: 'admin',
      }).exec();
      if (admins <= 1) {
        throw new BadRequestException('Cannot demote the last team admin');
      }
    }

    if (actorUserId === targetUserId && target.role === 'admin' && role !== 'admin') {
      throw new BadRequestException('Admin cannot self-demote');
    }

    target.role = role;
    await target.save();
  }

  async removeMember(
    teamId: string,
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertTeamAdmin(actorUserId, teamId);

    const target = await this.teamMemberModel
      .findOne({
        teamId: this.toObjectId(teamId),
        userId: this.toObjectId(targetUserId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!target) {
      throw new NotFoundException('Team member not found');
    }

    if (target.role === 'admin') {
      const admins = await this.teamMemberModel.countDocuments({
        teamId: this.toObjectId(teamId),
        isDeleted: { $ne: true },
        role: 'admin',
      }).exec();
      if (admins <= 1) {
        throw new BadRequestException('Cannot remove the last team admin');
      }
    }

    if (actorUserId === targetUserId && target.role === 'admin') {
      throw new BadRequestException('Admin cannot remove self');
    }

    target.isDeleted = true;
    await target.save();
  }
}
