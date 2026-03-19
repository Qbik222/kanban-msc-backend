import { ApiProperty } from '@nestjs/swagger';
import { BoardResponseDto } from './board-response.dto';
import { ColumnResponseDto } from './column-response.dto';

export class BoardDetailsResponseDto extends BoardResponseDto {
  @ApiProperty({ type: [ColumnResponseDto] })
  columns!: ColumnResponseDto[];
}
