import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.schema';
import { RefreshSessionsService } from './refresh-sessions.service';
import {
  hashToken,
  parseExpiresToMs,
  randomUUID,
  signCsrfToken,
  verifyCsrfToken,
} from './auth-tokens.util';

type RefreshJwtPayload = {
  sub: string;
  jti: string;
  typ: 'refresh';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshSessions: RefreshSessionsService,
  ) {}

  private getAccessSecret(): string {
    return process.env.JWT_SECRET || 'dev_jwt_secret';
  }

  private getRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || this.getAccessSecret();
  }

  private getCsrfSecret(): string {
    return (
      process.env.CSRF_HMAC_SECRET ||
      this.getRefreshSecret()
    );
  }

  private buildAccessPayload(user: User) {
    return {
      sub: user.id,
      email: user.email,
    };
  }

  /**
   * Creates access + refresh JWT, refresh session row, CSRF token for jti.
   */
  async issueTokensForUser(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
    user: Record<string, unknown>;
    sessionId: string;
  }> {
    const jti = randomUUID();
    const refreshExpires = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    const refreshPayload: RefreshJwtPayload = {
      sub: user.id,
      jti,
      typ: 'refresh',
    };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.getRefreshSecret(),
      expiresIn: refreshExpires,
    });
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseExpiresToMs(refreshExpires));
    const session = await this.refreshSessions.createSession({
      jti,
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const accessExpires = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
    const accessToken = await this.jwtService.signAsync(
      this.buildAccessPayload(user),
      {
        secret: this.getAccessSecret(),
        expiresIn: accessExpires,
      },
    );

    const csrfToken = signCsrfToken(jti, this.getCsrfSecret());

    return {
      accessToken,
      refreshToken,
      csrfToken,
      user: user.toJSON() as Record<string, unknown>,
      sessionId: session._id.toString(),
    };
  }

  async register(dto: RegisterDto) {
    const user = await this.usersService.createUser(dto);
    return this.issueTokensForUser(user);
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
    return this.issueTokensForUser(user);
  }

  async refreshTokens(
    refreshCookie: string | undefined,
    csrfHeader: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string; csrfToken: string }> {
    if (!refreshCookie) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshJwtPayload>(
        refreshCookie,
        { secret: this.getRefreshSecret() },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.typ !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const jti = payload.jti;
    if (!verifyCsrfToken(jti, this.getCsrfSecret(), csrfHeader)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = hashToken(refreshCookie);
    const session = await this.refreshSessions.findActiveByJtiAndHash(
      jti,
      tokenHash,
    );

    if (!session) {
      const stale = await this.refreshSessions.findByJti(jti);
      if (
        stale?.revokedAt &&
        process.env.REFRESH_REUSE_REVOKE_ALL === 'true'
      ) {
        await this.refreshSessions.revokeAllForUser(stale.userId.toString());
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    const issued = await this.issueTokensForUser(user);

    await this.refreshSessions.revokeSession(
      session._id.toString(),
      new Types.ObjectId(issued.sessionId),
    );

    return {
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      csrfToken: issued.csrfToken,
    };
  }

  async logout(
    refreshCookie: string | undefined,
    csrfHeader: string | undefined,
  ): Promise<void> {
    if (!refreshCookie) {
      return;
    }

    let payload: RefreshJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshJwtPayload>(
        refreshCookie,
        { secret: this.getRefreshSecret() },
      );
    } catch {
      return;
    }

    if (payload.typ !== 'refresh' || !payload.jti) {
      return;
    }

    if (!verifyCsrfToken(payload.jti, this.getCsrfSecret(), csrfHeader)) {
      return;
    }

    const tokenHash = hashToken(refreshCookie);
    const session = await this.refreshSessions.findActiveByJtiAndHash(
      payload.jti,
      tokenHash,
    );

    if (session) {
      await this.refreshSessions.revokeSession(session._id.toString());
    }
  }
}
