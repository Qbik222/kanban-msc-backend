import { Type } from 'class-transformer';
import {
  IsArray,
  IsMongoId,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderColumnItemDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a099' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  order!: number;
}

export class ReorderColumnsDto {
  @ApiProperty({ type: [ReorderColumnItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderColumnItemDto)
  columns!: ReorderColumnItemDto[];
}
