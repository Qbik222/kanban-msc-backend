import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { Board } from '../boards/board.schema';
import { BoardMember } from '../permissions/board-member.schema';
import { Team } from './team.schema';
import { TeamMember } from './team-member.schema';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import { TeamMemberResponseDto } from './dto/team-member-response.dto';
import { InviteTeamMemberCandidateDto } from './dto/invite-team-member-search.dto';
import { TeamRole } from './team.constants';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name)
    private readonly teamModel: Model<Team>,
    @InjectModel(TeamMember.name)
    private readonly teamMemberModel: Model<TeamMember>,
    @InjectModel(Board.name)
    private readonly boardModel: Model<Board>,
    @InjectModel(BoardMember.name)
    private readonly boardMemberModel: Model<BoardMember>,
    private readonly usersService: UsersService,
  ) {}

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid id');
    }
    return new Types.ObjectId(id);
  }

  private mapTeam(team: any, role: TeamRole): TeamResponseDto {
    return {
      id: String(team?._id ?? team?.id),
      name: team?.name ?? '',
      role,
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

    return this.mapTeam(team, 'admin');
  }

  async findAllForUser(userId: string): Promise<TeamResponseDto[]> {
    const userOid = this.toObjectId(userId);
    const memberships = await this.teamMemberModel
      .find({ userId: userOid, isDeleted: { $ne: true } })
      .select({ teamId: 1, role: 1 })
      .exec();

    const roleByTeamId = new Map<string, TeamRole>();
    for (const m of memberships) {
      roleByTeamId.set(m.teamId.toString(), m.role);
    }

    const teamIds = Array.from(roleByTeamId.keys()).map((id) => new Types.ObjectId(id));
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

    return teams.map((t) =>
      this.mapTeam(t, roleByTeamId.get(t._id.toString())!),
    );
  }

  async findOneForUser(userId: string, teamId: string): Promise<TeamResponseDto> {
    const role = await this.getTeamRole(userId, teamId);
    if (role === null) {
      throw new NotFoundException('Team not found');
    }

    const team = await this.teamModel
      .findOne({
        _id: this.toObjectId(teamId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return this.mapTeam(team, role);
  }

  async update(
    teamId: string,
    actorUserId: string,
    dto: UpdateTeamDto,
  ): Promise<TeamResponseDto> {
    await this.assertTeamAdmin(actorUserId, teamId);

    const team = await this.teamModel
      .findOneAndUpdate(
        { _id: this.toObjectId(teamId), isDeleted: { $ne: true } },
        { $set: { name: dto.name.trim() } },
        { new: true },
      )
      .exec();

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return this.mapTeam(team, 'admin');
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

  async listMembersForTeam(
    actorUserId: string,
    teamId: string,
  ): Promise<TeamMemberResponseDto[]> {
    // Membership check: only team members can view the members list.
    const actorRole = await this.getTeamRole(actorUserId, teamId);
    if (actorRole === null) {
      throw new NotFoundException('Team not found');
    }

    const members = await this.teamMemberModel
      .find({ teamId: this.toObjectId(teamId), isDeleted: { $ne: true } })
      .populate('userId', 'email name')
      .exec();

    if (members.length === 0) {
      return [];
    }

    const teamOid = this.toObjectId(teamId);

    // Collect all active boards for this team, then assign which of them
    // each member can access:
    // - team admin => all team boards (matches permissions logic)
    // - other roles => boards where user is owner or has BoardMember row
    const teamBoards = await this.boardModel
      .find({ teamId: teamOid, isDeleted: false })
      .select({ _id: 1, title: 1, ownerId: 1 })
      .sort({ updatedAt: -1 })
      .exec();

    const boardIdToRef = new Map<string, { id: string; title: string }>();
    const ownerBoardIdsByUser = new Map<string, Set<string>>();
    const boardOids = teamBoards.map((b) => b._id);

    for (const b of teamBoards) {
      const bid = b._id.toString();
      boardIdToRef.set(bid, { id: bid, title: String(b.title ?? '') });

      const ownerKey = b.ownerId?.toString() ?? '';
      if (!ownerBoardIdsByUser.has(ownerKey)) {
        ownerBoardIdsByUser.set(ownerKey, new Set());
      }
      ownerBoardIdsByUser.get(ownerKey)!.add(bid);
    }

    const memberUserIds = members
      .map((m: any) => m.userId?._id?.toString() ?? m.userId?.id?.toString() ?? '')
      .filter((id: string) => Boolean(id));

    const boardMemberBoardIdsByUser = new Map<string, Set<string>>();

    if (boardOids.length > 0 && memberUserIds.length > 0) {
      const boardMemberRows = await this.boardMemberModel
        .find({
          boardId: { $in: boardOids },
          userId: { $in: memberUserIds.map((id) => new Types.ObjectId(id)) },
          isDeleted: { $ne: true },
        })
        .select({ boardId: 1, userId: 1 })
        .exec();

      for (const row of boardMemberRows) {
        const uid = row.userId.toString();
        const bid = row.boardId.toString();
        if (!boardMemberBoardIdsByUser.has(uid)) {
          boardMemberBoardIdsByUser.set(uid, new Set());
        }
        boardMemberBoardIdsByUser.get(uid)!.add(bid);
      }
    }

    return members.map((m: any) => {
      const user = m.userId;
      const userId = String(user?.id ?? user?._id ?? '');

      const isTeamAdmin = m.role === 'admin';
      let boardRefs: { id: string; title: string }[] = [];

      if (isTeamAdmin) {
        boardRefs = teamBoards.map((b) => ({
          id: b._id.toString(),
          title: String(b.title ?? ''),
        }));
      } else {
        const boardIds = new Set<string>();

        for (const bid of ownerBoardIdsByUser.get(userId) ?? []) {
          boardIds.add(bid);
        }

        for (const bid of boardMemberBoardIdsByUser.get(userId) ?? []) {
          boardIds.add(bid);
        }

        boardRefs = Array.from(boardIds)
          .map((bid) => boardIdToRef.get(bid))
          .filter(
            (ref): ref is { id: string; title: string } => ref !== undefined,
          );
      }

      return {
        id: userId,
        email: String(user?.email ?? ''),
        name: String(user?.name ?? ''),
        role: m.role,
        boards: boardRefs,
      } satisfies TeamMemberResponseDto;
    });
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

  async searchInviteCandidates(
    teamId: string,
    actorUserId: string,
    query: string,
    limit = 10,
  ): Promise<InviteTeamMemberCandidateDto[]> {
    await this.assertTeamAdmin(actorUserId, teamId);

    const candidates = await this.usersService.searchByEmailContains(query, limit);
    if (candidates.length === 0) return [];

    const teamOid = this.toObjectId(teamId);
    const candidateOids = candidates.map((c) => this.toObjectId(c.id));

    // Exclude only active members (isDeleted != true).
    // Users with only soft-deleted membership (isDeleted=true) are allowed for re-invite.
    const activeMembers = await this.teamMemberModel
      .find({
        teamId: teamOid,
        userId: { $in: candidateOids },
        isDeleted: { $ne: true },
      })
      .select({ userId: 1 })
      .exec();

    const activeUserIds = new Set(activeMembers.map((m) => String(m.userId)));

    return candidates.filter(
      (c) => c.id !== actorUserId && !activeUserIds.has(c.id),
    );
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
