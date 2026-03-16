import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '123' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'User Name' })
  name: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt?: Date;
}

