// Smoke test luồng lõi end-to-end (ARCHITECTURE.md §7, luồng A + luồng B) qua HTTP thật
// (Supertest → Nest → Postgres thật), không mock service nào. Một test này đi hết đường
// chính — hỏng bất cứ đâu trên đường là đỏ ở đây trước khi tới bất kỳ ai dùng thử.
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

describe('Luồng lõi end-to-end (ARCHITECTURE.md §7)', () => {
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

  it('luồng A — giao thẳng may vá: tạo việc → ack → bắt đầu → xong, TaskEvent sinh đúng thứ tự', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);
    const ownerAuth = authHeader(ctx.jwt, owner);
    const workerAuth = authHeader(ctx.jwt, worker);

    // 4. Chủ xưởng chạm "Phát việc" → POST /tasks
    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', ownerAuth)
      .send({ content: 'May 20 áo cho khách A', assigneeIds: [worker.id] });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);
    expect(createRes.body.status).toBe('new');
    expect(createRes.body.assignees).toHaveLength(1);
    expect(createRes.body.assignees[0].userId).toBe(worker.id);

    // 6. Công nhân mở app → thấy việc trong "việc của tôi"
    const mineRes = await request(app.getHttpServer())
      .get('/tasks/mine')
      .set('Authorization', workerAuth);
    expect(mineRes.status).toBe(200);
    expect(mineRes.body.map((t: { id: string }) => t.id)).toContain(taskId);

    // → chạm "Nhận việc"
    const ackRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/ack`)
      .set('Authorization', workerAuth);
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.status).toBe('acked');

    // → chạm "Bắt đầu"
    const startRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/start`)
      .set('Authorization', workerAuth);
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe('in_progress');

    // → chạm "Xong"
    const doneRes = await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/done`)
      .set('Authorization', workerAuth);
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.status).toBe('done');

    // 9. Chủ xưởng mở S1 tổng hợp → thấy việc của Toàn đã xong, kèm mốc thời gian đúng thứ tự
    const detail = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', ownerAuth);
    expect(detail.status).toBe(200);
    const kinds = detail.body.events.map((e: { kind: string }) => e.kind);
    expect(kinds).toEqual(['acked', 'started', 'done']);
    const times = detail.body.events.map((e: { at: string }) => new Date(e.at).getTime());
    expect(times[0]).toBeLessThanOrEqual(times[1]);
    expect(times[1]).toBeLessThanOrEqual(times[2]);

    const summary = await request(app.getHttpServer()).get('/tasks').set('Authorization', ownerAuth);
    expect(summary.status).toBe(200);
    const summaryTask = summary.body.find((t: { id: string }) => t.id === taskId);
    expect(summaryTask.status).toBe('done');
  });

  it('luồng B — mảng bạt chia hai tầng: việc không assignee vào hàng đợi → điều phối giao → hiện ở "việc của tôi" người được giao', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator', line: 'bat' });
    const batWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'bat', active: true });
    userIds.push(owner.id, coordinator.id, batWorker.id);
    const ownerAuth = authHeader(ctx.jwt, owner);
    const coordinatorAuth = authHeader(ctx.jwt, coordinator);
    const batWorkerAuth = authHeader(ctx.jwt, batWorker);

    // 1–4. Chủ xưởng chọn "nhóm bạt" thay vì người cụ thể; việc mang số đo
    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', ownerAuth)
      .send({ content: 'Bạt che 3x4m cho khách B', line: 'bat', measurements: '3m x 4m' });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);
    // Task mảng bạt tạo ra LUÔN không có assignee (ARCHITECTURE.md §6).
    expect(createRes.body.assignees).toHaveLength(0);

    // 5–6. Nằm ở hàng đợi (S9) → điều phối mở thấy việc + số đo
    const queueRes = await request(app.getHttpServer())
      .get('/tasks/bat-queue')
      .set('Authorization', coordinatorAuth);
    expect(queueRes.status).toBe(200);
    const queued = queueRes.body.find((t: { id: string }) => t.id === taskId);
    expect(queued).toBeDefined();
    expect(queued.measurements).toBe('3m x 4m');

    // → chọn thợ → chạm "Giao"
    const assignRes = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assign`)
      .set('Authorization', coordinatorAuth)
      .send({ userIds: [batWorker.id] });
    expect(assignRes.status).toBe(201);
    expect(assignRes.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([batWorker.id]);

    // 7. Thợ bạt nhận việc → xuất hiện đúng trong "việc của tôi", kèm số đo
    const mineRes = await request(app.getHttpServer())
      .get('/tasks/mine')
      .set('Authorization', batWorkerAuth);
    expect(mineRes.status).toBe(200);
    const mine = mineRes.body.find((t: { id: string }) => t.id === taskId);
    expect(mine).toBeDefined();
    expect(mine.measurements).toBe('3m x 4m');

    // 8. Chủ xưởng mở S1 → thấy đúng tên thợ đang cầm việc
    const detail = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', ownerAuth);
    expect(detail.status).toBe(200);
    expect(detail.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([batWorker.id]);
  });
});
