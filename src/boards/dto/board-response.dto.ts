import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BoardResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  id!: string;

  @ApiProperty({ example: 'Sprint Board' })
  title!: string;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1ffff' })
  ownerId!: string;

  @ApiProperty({ example: ['65f0b3c3f2b7f6a1e9b1a010', '65f0b3c3f2b7f6a1e9b1a011'], isArray: true })
  projectIds!: string[];

  @ApiProperty({ example: false })
  isDeleted!: boolean;

  @ApiPropertyOptional({ example: '2026-03-19T09:00:00.000Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2026-03-19T09:30:00.000Z' })
  updatedAt?: Date;
}
