import { IsMongoId, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateColumnDto {
  @ApiProperty({ example: 'To Do', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1, { message: 'Title must be at least 1 character' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title!: string;

  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  @IsMongoId()
  boardId!: string;
}
