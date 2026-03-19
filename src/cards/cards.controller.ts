import {
  Body,
  Controller,
  Delete,
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

@ApiTags('cards')
@Controller('cards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new card' })
  @ApiBody({ type: CreateCardDto })
  @ApiResponse({ status: 201, description: 'Card created', type: CardResponseDto })
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
  async deleteComment(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ): Promise<CardResponseDto> {
    return this.cardsService.deleteComment(id, commentId, req.user.userId);
  }
}

