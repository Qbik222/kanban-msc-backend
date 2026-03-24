import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsMongoId,
  IsOptional,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { DeadlineDto, DeadlineRangeValidator } from './deadline.dto';

export class UpdateCardDto {
  @ApiPropertyOptional({ example: 'Implement login page', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 'Login form with validation', minLength: 1, maxLength: 2000 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '65f0b3c3f2b7f6a1e9b1a050' })
  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @ApiPropertyOptional({
    type: () => DeadlineDto,
    example: { startDate: '2026-03-19T09:00:00.000Z', endDate: '2026-03-20T09:00:00.000Z' },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeadlineDto)
  @Validate(DeadlineRangeValidator)
  deadline?: DeadlineDto;

  @ApiPropertyOptional({
    example: ['65f0b3c3f2b7f6a1e9b1a001', '65f0b3c3f2b7f6a1e9b1a002'],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  projectIds?: string[];

  @ApiPropertyOptional({ example: 'medium', enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';
}

