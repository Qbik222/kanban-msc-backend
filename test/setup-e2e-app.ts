import { INestApplication, ValidationPipe } from '@nestjs/common';
import { configureHttpMiddleware } from '../src/app-configuration';

/** Cookie parser + CORS + ValidationPipe — mirror production HTTP stack for e2e. */
export function setupE2EHttpApp(app: INestApplication): void {
  configureHttpMiddleware(app);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
