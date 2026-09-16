import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module.js';
import { JsonLogger } from './common/logger/json-logger.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.APP_ENV ?? 'development' });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use(helmet());

  // Chỉ app mobile (workshop-app) gọi vào — RN/Expo không phải trình duyệt nên không bị
  // CORS chặn dù để trống. `ALLOWED_ORIGINS` (phân tách bằng dấu phẩy) chỉ cần khi
  // owner-dashboard (web, vòng 8) lên production và gọi từ trình duyệt thật
  // (SECURITY.md §4 "CORS chỉ mở cho domain của mình").
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  if (allowedOrigins && allowedOrigins.length > 0) {
    app.enableCors({ origin: allowedOrigins });
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
