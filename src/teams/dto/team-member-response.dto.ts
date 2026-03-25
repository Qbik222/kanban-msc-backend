import { ApiProperty } from '@nestjs/swagger';
import { TEAM_ROLES, TeamRole } from '../team.constants';

export class BoardRefDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  id!: string;

  @ApiProperty({ example: 'Sprint Planning' })
  title!: string;
}

export class TeamMemberResponseDto {
  @ApiProperty({ example: '65f0b3c3f2b7f6a1e9b1a001' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'User Name' })
  name!: string;

  @ApiProperty({ enum: TEAM_ROLES, example: 'user' })
  role!: TeamRole;

  @ApiProperty({ type: BoardRefDto, isArray: true })
  boards!: BoardRefDto[];
}

