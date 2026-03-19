import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CardCommentDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a111' })
  _id!: string;

  @ApiProperty({ example: 'Looks great' })
  text!: string;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a222' })
  authorId!: string;

  @ApiPropertyOptional({ example: '2026-03-19T09:30:00.000Z' })
  createdAt?: Date;
}

export class CardResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a012' })
  id!: string;

  @ApiProperty({ example: 'Implement login page' })
  title!: string;

  @ApiProperty({ example: 0 })
  order!: number;

  @ApiProperty({ example: 'Login form with validation and error messages' })
  description!: string;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a099' })
  columnId!: string;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  boardId!: string;

  @ApiProperty({ example: false })
  isDeleted!: boolean;

  @ApiPropertyOptional({ example: '65f0b3c3f2b7f6a1e9b1a333' })
  assigneeId?: string;

  @ApiPropertyOptional({
    example: { startDate: '2026-03-19T09:00:00.000Z', endDate: '2026-03-20T09:00:00.000Z' },
  })
  deadline?: {
    startDate?: Date;
    endDate?: Date;
  };

  @ApiProperty({ example: ['65f0b3c3f2b7f6a1e9b1a010'] })
  projectIds!: string[];

  @ApiPropertyOptional({ example: 'medium', enum: ['low', 'medium', 'high'] })
  priority?: 'low' | 'medium' | 'high';

  @ApiProperty({ type: [CardCommentDto] })
  comments!: CardCommentDto[];

  @ApiPropertyOptional({ example: '2026-03-19T09:00:00.000Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2026-03-19T09:30:00.000Z' })
  updatedAt?: Date;
}
