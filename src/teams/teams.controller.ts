import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamResponseDto } from './dto/team-response.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto';

@ApiTags('teams')
@Controller('teams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Create team (creator becomes admin)' })
  @ApiBody({ type: CreateTeamDto })
  @ApiResponse({ status: 201, type: TeamResponseDto })
  async create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateTeamDto,
  ): Promise<TeamResponseDto> {
    return this.teamsService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List teams for current user' })
  @ApiResponse({ status: 200, type: TeamResponseDto, isArray: true })
  async findAll(
    @Req() req: { user: { userId: string } },
  ): Promise<TeamResponseDto[]> {
    return this.teamsService.findAllForUser(req.user.userId);
  }

  @Get(':teamId')
  @ApiOperation({ summary: 'Get team by id (must be a member)' })
  @ApiParam({ name: 'teamId', description: 'Team id' })
  @ApiResponse({ status: 200, type: TeamResponseDto })
  @ApiResponse({ status: 404, description: 'Team not found or no access' })
  async findOne(
    @Req() req: { user: { userId: string } },
    @Param('teamId') teamId: string,
  ): Promise<TeamResponseDto> {
    return this.teamsService.findOneForUser(req.user.userId, teamId);
  }

  @Post(':teamId/members')
  @ApiOperation({ summary: 'Add user to team (admin only)' })
  @ApiBody({ type: InviteTeamMemberDto })
  @ApiResponse({ status: 201, description: 'Member added' })
  async inviteMember(
    @Req() req: { user: { userId: string } },
    @Param('teamId') teamId: string,
    @Body() dto: InviteTeamMemberDto,
  ): Promise<void> {
    await this.teamsService.inviteMember(teamId, req.user.userId, dto.userId);
  }

  @Patch(':teamId/members/:memberUserId/role')
  @ApiOperation({ summary: 'Update team member role (admin only)' })
  @ApiBody({ type: UpdateTeamMemberRoleDto })
  @ApiResponse({ status: 200, description: 'Role updated' })
  async updateMemberRole(
    @Req() req: { user: { userId: string } },
    @Param('teamId') teamId: string,
    @Param('memberUserId') memberUserId: string,
    @Body() dto: UpdateTeamMemberRoleDto,
  ): Promise<void> {
    await this.teamsService.updateMemberRole(
      teamId,
      req.user.userId,
      memberUserId,
      dto.role,
    );
  }

  @Delete(':teamId/members/:memberUserId')
  @ApiOperation({ summary: 'Remove team member (admin only)' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(
    @Req() req: { user: { userId: string } },
    @Param('teamId') teamId: string,
    @Param('memberUserId') memberUserId: string,
  ): Promise<void> {
    await this.teamsService.removeMember(teamId, req.user.userId, memberUserId);
  }
}
