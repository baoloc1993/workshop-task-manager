// Helper dùng chung cho các e2e-spec — KHÔNG phải test tự nó (không khớp
// pattern `**/*.e2e-spec.ts` của vitest.config.e2e.ts nên không bị chạy như một suite).
//
// Bootstrap app thật (AppModule) trên Postgres thật của máy dev (DATABASE_URL ở .env
// gốc repo — cùng DB `docker ps` đang chạy ở deployment/local/docker-compose.yml của
// repo gốc). Không có endpoint "tạo nhân viên" ở vòng 1 (chỉ seed.ts) nên test
// tạo User trực tiếp qua PrismaService, ký token trực tiếp qua JwtService — đúng cơ chế
// AuthService dùng thật, không phải mock.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Line, Role, WorkerGroup } from '@prisma/client';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
}

export async function bootstrapTestApp(): Promise<TestCtx> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleFixture.createNestApplication();
  // Khớp main.ts — nếu không set lại pipe này thì validate DTO không chạy trong test.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    jwt: app.get(JwtService),
  };
}

export interface CreateUserOpts {
  role: Role;
  line?: Line;
  active?: boolean;
  name?: string;
  groups?: WorkerGroup[];
}

// Tiền tố để nhận diện + dọn sạch dữ liệu do bộ test này tạo ra, độc lập với seed.ts.
const TEST_TAG = 'e2e-test';

export async function createTestUser(prisma: PrismaService, opts: CreateUserOpts) {
  const suffix = randomUUID();
  return prisma.user.create({
    data: {
      name: opts.name ?? `${TEST_TAG}-${opts.role}-${suffix}`,
      role: opts.role,
      line: opts.line,
      active: opts.active ?? true,
      groups: opts.groups ?? [],
    },
  });
}

export function signToken(jwt: JwtService, user: { id: string; role: string }, pairingId?: string) {
  return jwt.sign({ sub: user.id, role: user.role, ...(pairingId ? { pairingId } : {}) });
}

export function authHeader(jwt: JwtService, user: { id: string; role: string }, pairingId?: string) {
  return `Bearer ${signToken(jwt, user, pairingId)}`;
}

// Dọn theo đúng thứ tự FK RESTRICT (migration.sql): task_events → task_assignees → tasks
// → device_pairings → users. An toàn khi gọi nhiều lần / mảng rỗng.
export async function cleanupTestData(
  prisma: PrismaService,
  ids: { taskIds?: string[]; userIds?: string[] },
) {
  const taskIds = ids.taskIds ?? [];
  const userIds = ids.userIds ?? [];

  if (taskIds.length) {
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.taskAssignee.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  }
  if (userIds.length) {
    await prisma.devicePairing.deleteMany({ where: { userId: { in: userIds } } });
    // Một số user có thể vẫn được tham chiếu bởi task tạo trong test khác nếu dọn
    // thiếu — bỏ qua lỗi FK còn sót để một test lỗi không kéo sập cleanup của test khác.
    try {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      // best-effort — không phải mục tiêu của bài test này
    }
  }
}

// Dọn dữ liệu mảng đệm (vòng 7): orderIds kéo theo mọi Task sinh RA từ cut-done/claim
// (không track hết được taskId từng cái vì server tự sinh chặng 2/3) — tìm theo orderId
// trước rồi mới xoá theo đúng thứ tự FK, sau đó orders → customers → users (dùng chung
// cleanupTestData ở trên cho phần user/task lẻ nếu có).
export async function cleanupDemTestData(
  prisma: PrismaService,
  ids: { orderIds?: string[]; customerIds?: string[]; userIds?: string[]; extraTaskIds?: string[] },
) {
  const orderIds = ids.orderIds ?? [];
  const userIds = ids.userIds ?? [];
  const customerIds = ids.customerIds ?? [];

  const orderTasks = orderIds.length
    ? await prisma.task.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
    : [];
  const taskIds = [...orderTasks.map((t) => t.id), ...(ids.extraTaskIds ?? [])];

  if (taskIds.length) {
    await prisma.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.taskAssignee.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  }
  if (orderIds.length) {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (customerIds.length) {
    try {
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    } catch {
      // best-effort
    }
  }
  if (userIds.length) {
    await prisma.devicePairing.deleteMany({ where: { userId: { in: userIds } } });
    try {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      // best-effort — không phải mục tiêu của bài test này
    }
  }
}
