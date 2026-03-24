import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  getClearCookieOptions,
  getClearCsrfCookieOptions,
  getCsrfCookieName,
  getCsrfCookieOptions,
  getRefreshCookieMaxAgeMs,
  getRefreshCookieName,
  getRefreshCookieOptions,
} from './auth-cookie.config';

function getCsrfHeaderFromRequest(req: Request): string | undefined {
  const a = req.get('x-csrf-token');
  const b = req.get('x-xsrf-token');
  return (a && a.trim()) || (b && b.trim()) || undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    schema: {
      example: {
        user: {
          id: '123',
          email: 'user@example.com',
          name: 'User Name',
          avatarUrl: 'https://example.com/avatar.png',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        accessToken: 'jwt-access',
        csrfToken: 'hex-hmac',
      },
    },
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    const maxAge = getRefreshCookieMaxAgeMs();
    res.cookie(
      getRefreshCookieName(),
      result.refreshToken,
      getRefreshCookieOptions(maxAge),
    );
    res.cookie(
      getCsrfCookieName(),
      result.csrfToken,
      getCsrfCookieOptions(maxAge),
    );
    return {
      user: result.user,
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    const maxAge = getRefreshCookieMaxAgeMs();
    res.cookie(
      getRefreshCookieName(),
      result.refreshToken,
      getRefreshCookieOptions(maxAge),
    );
    res.cookie(
      getCsrfCookieName(),
      result.csrfToken,
      getCsrfCookieOptions(maxAge),
    );
    return {
      user: result.user,
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary:
      'Refresh access token (HttpOnly refresh cookie + X-CSRF-Token or X-XSRF-TOKEN header)',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description:
      'CSRF token (same as readable CSRF cookie or body `csrfToken`). `X-XSRF-TOKEN` is accepted as an alias.',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'New access token; new refresh cookie set',
    schema: {
      example: { accessToken: 'jwt-access', csrfToken: 'hex-hmac' },
    },
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookie = req.cookies?.[getRefreshCookieName()] as string | undefined;
    const csrfHeader = getCsrfHeaderFromRequest(req);
    const csrfCookie = req.cookies?.[getCsrfCookieName()] as
      | string
      | undefined;
    const result = await this.authService.refreshTokens(
      cookie,
      csrfHeader,
      csrfCookie,
    );
    const maxAge = getRefreshCookieMaxAgeMs();
    res.cookie(
      getRefreshCookieName(),
      result.refreshToken,
      getRefreshCookieOptions(maxAge),
    );
    res.cookie(
      getCsrfCookieName(),
      result.csrfToken,
      getCsrfCookieOptions(maxAge),
    );
    return {
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
    };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({
    summary: 'Logout (revoke refresh session, clear cookie; X-CSRF-Token required)',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description:
      'CSRF token matching current refresh session (or `X-XSRF-TOKEN`).',
    required: true,
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie = req.cookies?.[getRefreshCookieName()] as string | undefined;
    const csrfHeader = getCsrfHeaderFromRequest(req);
    const csrfCookie = req.cookies?.[getCsrfCookieName()] as
      | string
      | undefined;
    await this.authService.logout(cookie, csrfHeader, csrfCookie);
    res.clearCookie(getRefreshCookieName(), getClearCookieOptions());
    res.clearCookie(getCsrfCookieName(), getClearCsrfCookieOptions());
  }
}
