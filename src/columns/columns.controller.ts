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
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';
import { ColumnResponseDto } from '../boards/dto/column-response.dto';

@ApiTags('columns')
@Controller('columns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new column' })
  @ApiBody({ type: CreateColumnDto })
  @ApiResponse({ status: 201, description: 'Column created', type: ColumnResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  async create(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateColumnDto,
  ): Promise<ColumnResponseDto> {
    return this.columnsService.create(dto, req.user.userId);
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder columns' })
  @ApiBody({ type: ReorderColumnsDto })
  @ApiResponse({ status: 200, description: 'Columns reordered', type: [ColumnResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async reorder(
    @Req() req: { user: { userId: string } },
    @Body() dto: ReorderColumnsDto,
  ): Promise<ColumnResponseDto[]> {
    return this.columnsService.reorder(dto.columns, req.user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update column title' })
  @ApiBody({ type: UpdateColumnDto })
  @ApiResponse({ status: 200, description: 'Column updated', type: ColumnResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpdateColumnDto,
  ): Promise<ColumnResponseDto> {
    return this.columnsService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a column and its cards' })
  @ApiResponse({ status: 200, description: 'Column deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Column not found' })
  async remove(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<void> {
    return this.columnsService.remove(id, req.user.userId);
  }
}
