import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Vòng 1: chỉ app mobile nội bộ gọi vào, chưa có domain thật để siết origin.
  // Siết lại khi có domain production (pha P, TECHSTACK.md §1 "Nơi deploy").
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
