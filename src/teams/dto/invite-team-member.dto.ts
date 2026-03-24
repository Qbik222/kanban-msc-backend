import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class InviteTeamMemberDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  @IsMongoId()
  userId!: string;
}
