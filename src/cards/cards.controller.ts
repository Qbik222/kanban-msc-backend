import {
  Body,
  Controller,
  Delete,
  HttpCode,
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
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { CardResponseDto } from '../boards/dto/card-response.dto';
import { BoardPermissionGuard, RequirePermissions } from '../permissions';

@ApiTags('cards')
@Controller('cards')
@UseGuards(JwtAuthGuard, BoardPermissionGuard)
@ApiBearerAuth()
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new card' })
  @ApiBody({ type: CreateCardDto })
  @ApiResponse({ status: 201, description: 'Card created', type: CardResponseDto })
  @RequirePermissions('card:create')
  async create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateCardDto,
  ): Promise<CardResponseDto> {
    return this.cardsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update card fields' })
  @ApiBody({ type: UpdateCardDto })
  @ApiResponse({ status: 200, description: 'Card updated', type: CardResponseDto })
  @RequirePermissions('card:update')
  async update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateCardDto,
  ): Promise<CardResponseDto> {
    return this.cardsService.update(id, dto, req.user.userId);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Move card to another column and recalculate order' })
  @ApiBody({ type: MoveCardDto })
  @ApiResponse({ status: 200, description: 'Card moved', type: CardResponseDto })
  @RequirePermissions('card:move')
  async move(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: MoveCardDto,
  ): Promise<CardResponseDto> {
    return this.cardsService.move(id, dto, req.user.userId);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Add a comment to card' })
  @ApiBody({ type: AddCommentDto })
  @ApiResponse({ status: 201, description: 'Comment added', type: CardResponseDto })
  @RequirePermissions('comment:create')
  async addComment(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
  ): Promise<CardResponseDto> {
    return this.cardsService.addComment(id, dto, req.user.userId);
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'Delete a comment from card' })
  @ApiResponse({ status: 200, description: 'Comment deleted', type: CardResponseDto })
  @RequirePermissions('board:read')
  async deleteComment(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ): Promise<CardResponseDto> {
    return this.cardsService.deleteComment(id, commentId, req.user.userId);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived card' })
  @ApiResponse({ status: 200, description: 'Card restored', type: CardResponseDto })
  @RequirePermissions('card:delete')
  async restore(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<CardResponseDto> {
    return this.cardsService.restore(id, req.user.userId);
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete a card (owner only)' })
  @ApiResponse({ status: 204, description: 'Card permanently deleted' })
  @RequirePermissions('card:purge')
  async removePermanent(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<void> {
    await this.cardsService.removePermanent(id, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive card (soft delete)' })
  @ApiResponse({ status: 200, description: 'Card archived', type: CardResponseDto })
  @RequirePermissions('card:delete')
  async remove(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<CardResponseDto> {
    return this.cardsService.remove(id, req.user.userId);
  }
}
