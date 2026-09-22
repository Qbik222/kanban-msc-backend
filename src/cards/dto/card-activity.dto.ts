import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CardActivityDeadlineRangeDto {
  @ApiPropertyOptional({ example: '2026-03-19T09:00:00.000Z' })
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-03-20T09:00:00.000Z' })
  endDate?: Date;
}

export class CardActivityDeadlinePayloadDto {
  @ApiPropertyOptional({ type: CardActivityDeadlineRangeDto, nullable: true })
  from?: CardActivityDeadlineRangeDto | null;

  @ApiPropertyOptional({ type: CardActivityDeadlineRangeDto, nullable: true })
  to?: CardActivityDeadlineRangeDto | null;
}

export class CardActivityAssigneePayloadDto {
  @ApiPropertyOptional({ example: '65f0b3c3f2b7f6a1e9b1a222', nullable: true })
  fromUserId?: string | null;

  @ApiPropertyOptional({ example: '65f0b3c3f2b7f6a1e9b1a333', nullable: true })
  toUserId?: string | null;
}

export class CardActivityDescriptionPayloadDto {
  @ApiProperty({ example: 'Old description' })
  from!: string;

  @ApiProperty({ example: 'New description' })
  to!: string;
}

export class CardActivityPriorityPayloadDto {
  @ApiProperty({ example: 'medium', enum: ['low', 'medium', 'high'] })
  from!: 'low' | 'medium' | 'high';

  @ApiProperty({ example: 'high', enum: ['low', 'medium', 'high'] })
  to!: 'low' | 'medium' | 'high';
}

export class CardActivityEntryDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a111' })
  _id!: string;

  @ApiProperty({
    enum: ['deadline_changed', 'assignee_changed', 'description_changed', 'priority_changed'],
    example: 'description_changed',
  })
  type!: 'deadline_changed' | 'assignee_changed' | 'description_changed' | 'priority_changed';

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a222' })
  actorId!: string;

  @ApiProperty({ example: '2026-03-19T09:30:00.000Z' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: CardActivityDeadlinePayloadDto })
  deadline?: CardActivityDeadlinePayloadDto;

  @ApiPropertyOptional({ type: CardActivityAssigneePayloadDto })
  assignee?: CardActivityAssigneePayloadDto;

  @ApiPropertyOptional({ type: CardActivityDescriptionPayloadDto })
  description?: CardActivityDescriptionPayloadDto;

  @ApiPropertyOptional({ type: CardActivityPriorityPayloadDto })
  priority?: CardActivityPriorityPayloadDto;
}

export class CardActivityResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a012' })
  cardId!: string;

  @ApiProperty({ type: [CardActivityEntryDto] })
  items!: CardActivityEntryDto[];
}
