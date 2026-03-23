import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** Used when CORS_ORIGINS is unset and NODE_ENV is not production (local SPA dev). */
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:5173',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:5173',
];

function resolveAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw !== undefined && raw.trim() !== '') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      'FATAL: CORS_ORIGINS must be set to a comma-separated list of allowed origins in production.',
    );
    process.exit(1);
  }
  return DEFAULT_DEV_ORIGINS;
}

const ALLOWED_ORIGINS = resolveAllowedOrigins();
const ALLOWED_SET = new Set(ALLOWED_ORIGINS);

/**
 * Express / Nest `cors` origin callback: allow non-browser clients (no Origin header);
 * allow browser only if Origin is in the allowlist.
 */
export function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    callback(null, true);
    return;
  }
  callback(null, ALLOWED_SET.has(origin));
}

export function getEnableCorsOptions(): CorsOptions {
  return {
    origin: corsOrigin as CorsOptions['origin'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  };
}

/** Socket.IO `ServerOptions.cors` — same origin policy as HTTP. */
export function getSocketIoCorsOptions(): {
  origin: typeof corsOrigin;
  credentials: boolean;
} {
  return {
    origin: corsOrigin,
    credentials: true,
  };
}

/** For logging / debugging at startup. */
export function getResolvedCorsOrigins(): readonly string[] {
  return ALLOWED_ORIGINS;
}
