// Ca biên "Gửi hai lần" (ARCHITECTURE.md §6): bấm cùng một nút hai lần liên tiếp không
// được sinh thêm mốc thời gian, và không được trả lỗi 500. Ràng buộc duy nhất
// (task_id,user_id,kind) trên TaskEvent là lưới chắn ở tầng dữ liệu — test này bắt cả hai
// đường: chặn sớm ở service (status đã ở đích) VÀ chặn ở constraint nếu hai request đua nhau.
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  authHeader,
  bootstrapTestApp,
  cleanupTestData,
  createTestUser,
  type TestCtx,
} from './utils/test-app.js';

describe('Double-submit — ack hai lần không tạo trùng TaskEvent, không lỗi 500', () => {
  let ctx: TestCtx;
  let app: INestApplication<App>;
  const userIds: string[] = [];
  const taskIds: string[] = [];

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await cleanupTestData(ctx.prisma, { taskIds, userIds });
    await app.close();
  });

  it('PATCH .../ack gọi hai lần liên tiếp → chỉ một TaskEvent(kind=acked), lần hai vẫn 200', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc kiểm double-submit', assigneeIds: [worker.id] });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);

    const workerAuth = authHeader(ctx.jwt, worker);

    const first = await request(app.getHttpServer()).patch(`/tasks/${taskId}/ack`).set('Authorization', workerAuth);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('acked');

    const second = await request(app.getHttpServer()).patch(`/tasks/${taskId}/ack`).set('Authorization', workerAuth);
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('acked');

    const events = await ctx.prisma.taskEvent.findMany({ where: { taskId, kind: 'acked' } });
    expect(events).toHaveLength(1);
  });

  it('gọi ack hai lần ĐUA NHAU gần như đồng thời (Promise.all) vẫn chỉ ra một TaskEvent, không 500', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc kiểm double-submit đua nhau', assigneeIds: [worker.id] });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);

    const workerAuth = authHeader(ctx.jwt, worker);

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).patch(`/tasks/${taskId}/ack`).set('Authorization', workerAuth),
      request(app.getHttpServer()).patch(`/tasks/${taskId}/ack`).set('Authorization', workerAuth),
    ]);

    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);

    const events = await ctx.prisma.taskEvent.findMany({ where: { taskId, kind: 'acked' } });
    expect(events).toHaveLength(1);
  });
});
