import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function signCsrfToken(jti: string, secret: string): string {
  return createHmac('sha256', secret).update(jti).digest('hex');
}

export function verifyCsrfToken(
  jti: string,
  secret: string,
  header: string | undefined,
): boolean {
  if (!header) {
    return false;
  }
  const expected = signCsrfToken(jti, secret);
  try {
    const a = Buffer.from(header, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Parses values like `15m`, `7d`, `3600s` into milliseconds. */
export function parseExpiresToMs(exp: string): number {
  const m = /^(\d+)([smhd])$/i.exec(exp.trim());
  if (!m) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  const mult: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (mult[u] ?? 86_400_000);
}

export { randomUUID };
