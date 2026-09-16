import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { RequestIdMiddleware } from './common/logger/request-id.middleware.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { HealthModule } from './health/health.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Repo đã tách khỏi repo gốc (DECISIONS.md 2026-09-10) — .env ở gốc repo này.
      envFilePath: ['.env'],
    }),
    // Nhóm 2 production-ready — mặc định toàn app (chống dò/spam thô), riêng
    // /auth/login và /auth/pairings/redeem siết chặt hơn qua @Throttle ở controller
    // (ROADMAP.md §3: đây là kênh đăng nhập DUY NHẤT của worker/bat-coordinator).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    NotificationsModule,
    TasksModule,
    HealthModule,
    FeedbackModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
