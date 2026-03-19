import {
  IsDate,
  IsOptional,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'DeadlineRangeValidator', async: false })
export class DeadlineRangeValidator implements ValidatorConstraintInterface {
  validate(deadline: any, _args: ValidationArguments): boolean {
    if (!deadline) return true;

    const start = deadline.startDate ? new Date(deadline.startDate).getTime() : undefined;
    const end = deadline.endDate ? new Date(deadline.endDate).getTime() : undefined;

    if (start === undefined || end === undefined) return true; // allow partial deadline
    return end >= start;
  }

  defaultMessage(): string {
    return 'endDate cannot be earlier than startDate';
  }
}

export class DeadlineDto {
  @ApiPropertyOptional({ example: '2026-03-19T09:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-03-20T09:30:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

