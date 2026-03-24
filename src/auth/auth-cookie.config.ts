import { parseExpiresToMs } from './auth-tokens.util';

export function getRefreshCookieName(): string {
  return process.env.REFRESH_COOKIE_NAME || 'refresh';
}

export function getRefreshCookiePath(): string {
  return process.env.REFRESH_COOKIE_PATH || '/auth';
}

export function getRefreshCookieMaxAgeMs(): number {
  return parseExpiresToMs(process.env.JWT_REFRESH_EXPIRES_IN || '7d');
}

export function getRefreshCookieOptions(maxAgeMs: number): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
} {
  const secure =
    process.env.REFRESH_COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
  const raw = (process.env.REFRESH_COOKIE_SAMESITE || 'lax').toLowerCase();
  const sameSite: 'lax' | 'strict' | 'none' =
    raw === 'strict' || raw === 'none' || raw === 'lax' ? raw : 'lax';
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: getRefreshCookiePath(),
    maxAge: maxAgeMs,
  };
}

export function getClearCookieOptions(): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
} {
  const maxAge = getRefreshCookieMaxAgeMs();
  const { httpOnly, secure, sameSite, path } = getRefreshCookieOptions(maxAge);
  return { httpOnly, secure, sameSite, path };
}

/** Readable double-submit CSRF cookie (same value as `csrfToken` in JSON). Default `XSRF-TOKEN` for Angular-style clients. */
export function getCsrfCookieName(): string {
  return process.env.CSRF_COOKIE_NAME || 'XSRF-TOKEN';
}

/** Wider than refresh cookie so `document.cookie` on any SPA route includes the CSRF name. */
export function getCsrfCookiePath(): string {
  return process.env.CSRF_COOKIE_PATH || '/';
}

export function getCsrfCookieOptions(maxAgeMs: number): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge: number;
} {
  const secure =
    process.env.REFRESH_COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
  const raw = (process.env.REFRESH_COOKIE_SAMESITE || 'lax').toLowerCase();
  const sameSite: 'lax' | 'strict' | 'none' =
    raw === 'strict' || raw === 'none' || raw === 'lax' ? raw : 'lax';
  return {
    httpOnly: false,
    secure,
    sameSite,
    path: getCsrfCookiePath(),
    maxAge: maxAgeMs,
  };
}

export function getClearCsrfCookieOptions(): {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
} {
  const maxAge = getRefreshCookieMaxAgeMs();
  const { httpOnly, secure, sameSite, path } = getCsrfCookieOptions(maxAge);
  return { httpOnly, secure, sameSite, path };
}
