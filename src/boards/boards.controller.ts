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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BoardsService } from './boards.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { BoardResponseDto } from './dto/board-response.dto';
import { BoardDetailsResponseDto } from './dto/board-details-response.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { BoardPermissionGuard, RequirePermissions } from '../permissions';

@ApiTags('boards')
@Controller('boards')
@UseGuards(JwtAuthGuard, BoardPermissionGuard)
@ApiBearerAuth()
export class BoardsController {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new board' })
  @ApiBody({ type: CreateBoardDto })
  @ApiResponse({ status: 201, description: 'Board created successfully', type: BoardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @RequirePermissions('board:create')
  async create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateBoardDto,
  ): Promise<BoardResponseDto> {
    return this.boardsService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all active boards for the current user' })
  @ApiResponse({ status: 200, description: 'List of boards', type: BoardResponseDto, isArray: true })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @RequirePermissions('board:list')
  async findAll(@Req() req: { user: { userId: string } }): Promise<BoardResponseDto[]> {
    return this.boardsService.findAllByOwner(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get board details with columns and cards' })
  @ApiResponse({
    status: 200,
    description: 'Board with populated columns and cards',
    type: BoardDetailsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  @RequirePermissions('board:read')
  async findOne(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<BoardDetailsResponseDto> {
    return this.boardsService.findOne(id, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a board' })
  @ApiBody({ type: UpdateBoardDto })
  @ApiResponse({ status: 200, description: 'Board updated successfully', type: BoardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  @RequirePermissions('board:update')
  async update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
  ): Promise<BoardResponseDto> {
    const board = await this.boardsService.update(id, req.user.userId, dto);
    this.eventsGateway.emitBoardUpdated(board);
    return board;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a board (move to trash)' })
  @ApiResponse({ status: 200, description: 'Board deleted successfully', type: BoardResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  @RequirePermissions('board:delete')
  async remove(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<BoardResponseDto> {
    const board = await this.boardsService.remove(id, req.user.userId);
    this.eventsGateway.emitBoardDeleted(board);
    return board;
  }

  @Post(':boardId/members')
  @ApiOperation({ summary: 'Invite member to board' })
  @ApiBody({ type: InviteMemberDto })
  @ApiResponse({ status: 201, description: 'Member invited' })
  @RequirePermissions('member:invite')
  async inviteMember(
    @Req() req: { user: { userId: string } },
    @Param('boardId') boardId: string,
    @Body() dto: InviteMemberDto,
  ): Promise<void> {
    await this.boardsService.inviteMember(boardId, req.user.userId, dto.userId);
  }

  @Patch(':boardId/members/:memberUserId/role')
  @ApiOperation({ summary: 'Update board member role' })
  @ApiBody({ type: UpdateMemberRoleDto })
  @ApiResponse({ status: 200, description: 'Member role updated' })
  @RequirePermissions('member:update_role')
  async updateMemberRole(
    @Req() req: { user: { userId: string } },
    @Param('boardId') boardId: string,
    @Param('memberUserId') memberUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<void> {
    await this.boardsService.updateMemberRole(boardId, req.user.userId, memberUserId, dto.role);
  }

  @Delete(':boardId/members/:memberUserId')
  @ApiOperation({ summary: 'Remove board member' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @RequirePermissions('member:remove')
  async removeMember(
    @Req() req: { user: { userId: string } },
    @Param('boardId') boardId: string,
    @Param('memberUserId') memberUserId: string,
  ): Promise<void> {
    await this.boardsService.removeMember(boardId, req.user.userId, memberUserId);
  }
}
