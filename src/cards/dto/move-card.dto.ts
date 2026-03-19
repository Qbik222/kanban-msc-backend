import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsMongoId, IsNumber, IsOptional, Min } from 'class-validator';

export class MoveCardDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a099' })
  @IsMongoId()
  targetColumnId!: string;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newOrder!: number;
}

