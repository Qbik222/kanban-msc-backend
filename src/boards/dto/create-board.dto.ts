import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBoardDto {
  @ApiProperty({ example: 'My Board', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1, { message: 'Title must be at least 1 character' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title!: string;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a000', description: 'Team id (team admin creates the board)' })
  @IsMongoId()
  teamId!: string;

  @ApiPropertyOptional({
    example: ['65f0b3c3f2b7f6a1e9b1a001', '65f0b3c3f2b7f6a1e9b1a002'],
    description: 'ids-only tags/projects attached to this board',
    isArray: true,
  })
  @IsOptional()
  @IsMongoId({ each: true })
  projectIds?: string[];
}
