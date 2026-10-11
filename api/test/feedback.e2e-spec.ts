// (kênh feedback) — xác nhận endpoint mới
// thật sự lắp đúng vào app (module đăng ký, guard áp dụng), không phải chỉ build qua.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { authHeader, bootstrapTestApp, cleanupTestData, createTestUser, type TestCtx } from './utils/test-app.js';

describe('POST /feedback', () => {
  let ctx: TestCtx;
  let app: INestApplication<App>;
  const userIds: string[] = [];

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.prisma.feedback.deleteMany({ where: { userId: { in: userIds } } });
    await cleanupTestData(ctx.prisma, { userIds });
    await app.close();
  });

  it('người đã đăng nhập gửi được góp ý, lưu đúng nội dung + đúng người gửi', async () => {
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(worker.id);

    const res = await request(app.getHttpServer())
      .post('/feedback')
      .set('Authorization', authHeader(ctx.jwt, worker))
      .send({ message: 'Nút Giao việc hơi khó bấm khi đứng máy.' });

    expect(res.status).toBe(201);
    const saved = await ctx.prisma.feedback.findUnique({ where: { id: res.body.id } });
    expect(saved?.userId).toBe(worker.id);
    expect(saved?.message).toBe('Nút Giao việc hơi khó bấm khi đứng máy.');
  });

  it('chưa đăng nhập gửi góp ý → 401', async () => {
    const res = await request(app.getHttpServer()).post('/feedback').send({ message: 'test' });
    expect(res.status).toBe(401);
  });
});
