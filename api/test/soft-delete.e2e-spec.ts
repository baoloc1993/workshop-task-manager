// Ca biên "Xoá" (ARCHITECTURE.md §6): xoá mềm (`deleted_at`), KHÔNG xoá cứng TaskEvent —
// mốc thời gian là dữ liệu nền của lịch sử (CAP-TASK-15) và báo cáo điểm nghẽn (vòng 8).
//
// Vòng 6 chưa có endpoint DELETE /tasks/:id (không có route nào gắn @Delete trong
// tasks.controller.ts) — nhưng mọi query đọc (findAll/findMine/findOne/bat-queue) đã lọc
// `deletedAt: null` sẵn, đúng như ARCHITECTURE.md §6 mô tả. Test này set deletedAt thẳng
// qua Prisma (mô phỏng trạng thái "đã xoá mềm") để kiểm đúng phần lọc đó — không giả lập gì
// khác. Thiếu endpoint xoá thật là phát hiện, báo ở cuối bài, không tự thêm route.
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

describe('Soft-delete — việc đã deletedAt biến khỏi danh sách chính, lịch sử không mất', () => {
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

  it('task có deletedAt không xuất hiện ở GET /tasks (owner) và GET /tasks/mine (worker), nhưng TaskEvent vẫn còn nguyên', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);
    const ownerAuth = authHeader(ctx.jwt, owner);
    const workerAuth = authHeader(ctx.jwt, worker);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', ownerAuth)
      .send({ content: 'Việc sẽ bị xoá mềm', assigneeIds: [worker.id] });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);

    // Để lại dấu vết lịch sử thật trước khi xoá — đây chính là dữ liệu không được mất.
    await request(app.getHttpServer()).patch(`/tasks/${taskId}/ack`).set('Authorization', workerAuth);

    const eventsBefore = await ctx.prisma.taskEvent.findMany({ where: { taskId } });
    expect(eventsBefore.length).toBeGreaterThan(0);

    // Mô phỏng xoá mềm (chưa có endpoint — xem ghi chú đầu file).
    await ctx.prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });

    const ownerList = await request(app.getHttpServer()).get('/tasks').set('Authorization', ownerAuth);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.map((t: { id: string }) => t.id)).not.toContain(taskId);

    const workerMine = await request(app.getHttpServer()).get('/tasks/mine').set('Authorization', workerAuth);
    expect(workerMine.status).toBe(200);
    expect(workerMine.body.map((t: { id: string }) => t.id)).not.toContain(taskId);

    // Chi tiết việc đã xoá cũng không đọc được nữa — đúng tinh thần "đã xoá thì không hiện",
    // nhưng dữ liệu nền vẫn ở DB, không xoá cứng.
    const detail = await request(app.getHttpServer()).get(`/tasks/${taskId}`).set('Authorization', ownerAuth);
    expect(detail.status).toBe(404);

    const eventsAfter = await ctx.prisma.taskEvent.findMany({ where: { taskId } });
    expect(eventsAfter).toHaveLength(eventsBefore.length);
    expect(eventsAfter.some((e) => e.kind === 'acked')).toBe(true);
  });

  it('task bạt đã deletedAt không còn ở hàng đợi (GET /tasks/bat-queue)', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator', line: 'bat' });
    userIds.push(owner.id, coordinator.id);

    const createRes = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Việc bạt sẽ bị xoá mềm', line: 'bat', measurements: '1x1' });
    const taskId = createRes.body.id as string;
    taskIds.push(taskId);

    await ctx.prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });

    const queue = await request(app.getHttpServer())
      .get('/tasks/bat-queue')
      .set('Authorization', authHeader(ctx.jwt, coordinator));
    expect(queue.status).toBe(200);
    expect(queue.body.map((t: { id: string }) => t.id)).not.toContain(taskId);
  });
});
