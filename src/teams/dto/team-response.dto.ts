import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TEAM_ROLES, TeamRole } from '../team.constants';

export class TeamResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: TEAM_ROLES, description: 'Current user role in this team' })
  role!: TeamRole;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  isDeleted!: boolean;

  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiPropertyOptional()
  updatedAt?: Date;
}
