import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { getEnableCorsOptions } from './config/cors-origins';

/**
 * Shared HTTP middleware for main.ts and e2e (cookie parser + CORS).
 */
export function configureHttpMiddleware(app: INestApplication): void {
  app.use(cookieParser());
  app.enableCors(getEnableCorsOptions());
}
