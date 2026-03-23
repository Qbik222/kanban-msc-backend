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
import { BoardPermissionGuard, RequirePermissions } from '../permissions';

@ApiTags('columns')
@Controller('columns')
@UseGuards(JwtAuthGuard, BoardPermissionGuard)
@ApiBearerAuth()
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new column' })
  @ApiBody({ type: CreateColumnDto })
  @ApiResponse({ status: 201, description: 'Column created', type: ColumnResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Board not found' })
  @RequirePermissions('column:create')
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
  @RequirePermissions('column:reorder')
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
  @RequirePermissions('column:update')
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
  @RequirePermissions('column:delete')
  async remove(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<void> {
    return this.columnsService.remove(id, req.user.userId);
  }
}
