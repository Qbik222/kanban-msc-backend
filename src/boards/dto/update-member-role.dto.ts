import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'], example: 'editor' })
  @IsIn(['owner', 'editor', 'viewer'])
  role!: 'owner' | 'editor' | 'viewer';
}
