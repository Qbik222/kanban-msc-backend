import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await app.listen(3000);
  const url = await app.getUrl();
  // eslint-disable-next-line no-console
  console.log(`Application is running on: ${url}`);
}

bootstrap();
