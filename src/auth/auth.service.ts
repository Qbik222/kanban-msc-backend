import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private buildTokenPayload(user: User) {
    return {
      sub: user.id,
      email: user.email,
    };
  }

  async register(dto: RegisterDto) {
    const user = await this.usersService.createUser(dto);
    const payload = this.buildTokenPayload(user);
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      user: user.toJSON(),
      accessToken,
    };
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    const payload = this.buildTokenPayload(user);
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      user: user.toJSON(),
      accessToken,
    };
  }
}

