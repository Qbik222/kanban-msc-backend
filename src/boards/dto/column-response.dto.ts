import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardResponseDto } from './card-response.dto';

export class ColumnResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a099' })
  id!: string;

  @ApiProperty({ example: 'To Do' })
  title!: string;

  @ApiProperty({ example: 0 })
  order!: number;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  boardId!: string;

  @ApiProperty({ type: [CardResponseDto] })
  cards!: CardResponseDto[];

  @ApiPropertyOptional({ example: '2026-03-19T09:00:00.000Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2026-03-19T09:30:00.000Z' })
  updatedAt?: Date;
}
