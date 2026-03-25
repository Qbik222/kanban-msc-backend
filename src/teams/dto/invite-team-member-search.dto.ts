import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class InviteTeamMemberSearchQueryDto {
  @ApiProperty({ example: 'yurii', minLength: 2 })
  @IsString()
  @MinLength(2)
  query!: string;

  @ApiPropertyOptional({ example: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class InviteTeamMemberCandidateDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'User Name' })
  name!: string;
}

