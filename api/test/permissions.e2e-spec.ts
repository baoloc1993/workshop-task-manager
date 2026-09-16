// Phân quyền — SPEC bắt buộc: PERSONAS.md §2 (ma trận vai × hành động). Mỗi ô ✗ ở đó là
// một ca kiểm ở đây: gọi thẳng API bằng token đúng vai nhưng SAI quyền phải bị chặn ở
// server, không chỉ ẩn nút trên app. Đây là nhóm test đáng giá nhất trong bài — dữ liệu
// của xưởng này không được rò sang tài khoản khác.
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

describe('Phân quyền — gọi thẳng API sai vai phải bị chặn (PERSONAS.md §2)', () => {
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

  it('công nhân gọi thẳng POST /tasks (tạo việc) → 403, không được tạo việc dù có token hợp lệ', async () => {
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(worker.id);

    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, worker))
      .send({ content: 'Việc tự bịa ra', assigneeIds: [worker.id] });

    expect(res.status).toBe(403);
  });

  it('công nhân gọi thẳng POST /tasks/:id/assign (chia việc bạt) → 403, việc không đổi assignee', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const mayVaWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    const batWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'bat', active: true });
    userIds.push(owner.id, mayVaWorker.id, batWorker.id);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Bạt chờ chia — thử phá quyền', line: 'bat', measurements: '2x2' });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assign`)
      .set('Authorization', authHeader(ctx.jwt, mayVaWorker))
      .send({ userIds: [batWorker.id] });

    expect(res.status).toBe(403);

    const after = await ctx.prisma.taskAssignee.findMany({ where: { taskId } });
    expect(after).toHaveLength(0);
  });

  it('công nhân hoặc điều phối gọi thẳng PATCH /tasks/reorder (đổi ưu tiên) → 403, priority không đổi', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator', line: 'bat' });
    userIds.push(owner.id, worker.id, coordinator.id);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc để kiểm priority', assigneeIds: [worker.id] });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);
    const priorityBefore = createRes.body.priority as number;

    const asWorker = await request(app.getHttpServer())
      .patch('/tasks/reorder')
      .set('Authorization', authHeader(ctx.jwt, worker))
      .send({ taskIds: [taskId] });
    expect(asWorker.status).toBe(403);

    const asCoordinator = await request(app.getHttpServer())
      .patch('/tasks/reorder')
      .set('Authorization', authHeader(ctx.jwt, coordinator))
      .send({ taskIds: [taskId] });
    expect(asCoordinator.status).toBe(403);

    const unchanged = await ctx.prisma.task.findUnique({ where: { id: taskId } });
    expect(unchanged?.priority).toBe(priorityBefore);
  });

  it('công nhân hoặc điều phối gọi thẳng GET /tasks (tổng hợp toàn xưởng) → 403', async () => {
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator', line: 'bat' });
    userIds.push(worker.id, coordinator.id);

    const asWorker = await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', authHeader(ctx.jwt, worker));
    expect(asWorker.status).toBe(403);

    const asCoordinator = await request(app.getHttpServer())
      .get('/tasks')
      .set('Authorization', authHeader(ctx.jwt, coordinator));
    expect(asCoordinator.status).toBe(403);
  });

  it('điều phối gọi assign lên việc mảng may vá (không phải bạt) → bị chặn, không tạo assignee mới', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator', line: 'bat' });
    const mayVaWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, coordinator.id, mayVaWorker.id);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc may vá — điều phối không được đụng', assigneeIds: [mayVaWorker.id] });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);

    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/assign`)
      .set('Authorization', authHeader(ctx.jwt, coordinator))
      .send({ userIds: [mayVaWorker.id] });

    // Biết hiện trả 400 (BadRequestException "Chỉ chia được việc mảng bạt qua đây"), không
    // phải 403 — sai theo PERSONAS.md §2 nhưng KHÔNG sửa code ở đây (báo lại, xem cuối bài).
    // Test chỉ xác nhận CÓ bị chặn và assignee gốc không đổi, không khoá vào mã lỗi cụ thể.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const assignees = await ctx.prisma.taskAssignee.findMany({ where: { taskId } });
    expect(assignees.map((a) => a.userId)).toEqual([mayVaWorker.id]);
  });

  it('công nhân A gọi /tasks/mine chỉ thấy việc của mình, không thấy việc của công nhân B', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const workerA = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    const workerB = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, workerA.id, workerB.id);

    const taskA = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc riêng của A', assigneeIds: [workerA.id] });
    const taskB = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc riêng của B', assigneeIds: [workerB.id] });
    taskIds.push(taskA.body.id, taskB.body.id);

    const mineOfA = await request(app.getHttpServer())
      .get('/tasks/mine')
      .set('Authorization', authHeader(ctx.jwt, workerA));
    expect(mineOfA.status).toBe(200);
    const idsSeenByA = mineOfA.body.map((t: { id: string }) => t.id);
    expect(idsSeenByA).toContain(taskA.body.id);
    expect(idsSeenByA).not.toContain(taskB.body.id);

    // Gọi thẳng chi tiết việc của B bằng token của A → không đọc được (AC-4).
    const detailOfBByA = await request(app.getHttpServer())
      .get(`/tasks/${taskB.body.id}`)
      .set('Authorization', authHeader(ctx.jwt, workerA));
    expect(detailOfBByA.status).toBe(403);
  });

  it('không có token → 401 trên endpoint cần đăng nhập', async () => {
    const res = await request(app.getHttpServer()).get('/tasks/mine');
    expect(res.status).toBe(401);
  });
});
