import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CardResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a012' })
  id!: string;

  @ApiProperty({ example: 'Implement login page' })
  title!: string;

  @ApiProperty({ example: 0 })
  order!: number;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a099' })
  columnId!: string;

  @ApiPropertyOptional({ example: '2026-03-19T09:00:00.000Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2026-03-19T09:30:00.000Z' })
  updatedAt?: Date;
}
