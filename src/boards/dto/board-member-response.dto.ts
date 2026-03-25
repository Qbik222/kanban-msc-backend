import { ApiProperty } from '@nestjs/swagger';
import { BOARD_ROLES, BoardRole } from '../../permissions';

export class BoardMemberResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'User Name' })
  name!: string;

  @ApiProperty({ enum: BOARD_ROLES, example: 'viewer' })
  role!: BoardRole;
}

