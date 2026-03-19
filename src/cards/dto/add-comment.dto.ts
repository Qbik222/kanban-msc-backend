import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class AddCommentDto {
  @ApiProperty({ example: 'Looks good!', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

