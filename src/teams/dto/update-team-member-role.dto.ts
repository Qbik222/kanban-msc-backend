import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { TEAM_ROLES, TeamRole } from '../team.constants';

export class UpdateTeamMemberRoleDto {
  @ApiProperty({ enum: TEAM_ROLES, example: 'user' })
  @IsString()
  @IsIn([...TEAM_ROLES])
  role!: TeamRole;
}
