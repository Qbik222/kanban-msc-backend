import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeamResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
