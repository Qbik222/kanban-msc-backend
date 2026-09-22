import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddCommentDto {
  @ApiProperty({ example: 'Looks good!', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({
    example: '65f0b3c3f2b7f6a1e9b1a110',
    description: 'Optional parent comment id for a reply',
  })
  @IsOptional()
  @IsMongoId()
  parentCommentId?: string;
}
