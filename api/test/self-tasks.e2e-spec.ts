// + (điều phối là người nhận). Ma trận
// các dòng "": mỗi ô ✗ là một ca gọi thẳng API phải bị chặn ở server; lọc danh sách
// (việc chờ duyệt không lọt danh sách toàn xưởng).
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

describe('thợ tự ghi việc + chủ xưởng duyệt + điều phối nhận việc', () => {
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

  const http = () => request(app.getHttpServer());

  it('thợ chưa bật tự duyệt tự ghi việc → pending, có ở "Việc của tôi" nhưng không lọt GET /tasks, hàng đợi bạt, lịch sử toàn xưởng', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const batWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'bat' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator' });
    userIds.push(owner.id, batWorker.id, coordinator.id);

    const res = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, batWorker))
      .send({ content: '  Khâu lại mép bạt xe tải  ' });
    expect(res.status).toBe(201);
    taskIds.push(res.body.id);
    expect(res.body).toMatchObject({
      content: 'Khâu lại mép bạt xe tải',
      line: 'bat',
      source: 'self',
      approval: 'pending',
      createdById: batWorker.id,
    });
    expect(res.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([batWorker.id]);

    const mine = await http().get('/tasks/mine').set('Authorization', authHeader(ctx.jwt, batWorker));
    expect(mine.body.map((t: { id: string }) => t.id)).toContain(res.body.id);

    const all = await http().get('/tasks').set('Authorization', authHeader(ctx.jwt, owner));
    expect(all.body.map((t: { id: string }) => t.id)).not.toContain(res.body.id);

    const batQueue = await http().get('/tasks/bat-queue').set('Authorization', authHeader(ctx.jwt, coordinator));
    expect(batQueue.body.map((t: { id: string }) => t.id)).not.toContain(res.body.id);

    // Điều phối xem được mọi việc bạt ĐÃ DUYỆT, nhưng không thấy việc chờ duyệt của người khác.
    const detail = await http().get(`/tasks/${res.body.id}`).set('Authorization', authHeader(ctx.jwt, coordinator));
    expect(detail.status).toBe(403);

    // Việc chờ duyệt vẫn nhận / bắt đầu / xong được bởi chính người ghi.
    for (const step of ['ack', 'start', 'done']) {
      const r = await http().patch(`/tasks/${res.body.id}/${step}`).set('Authorization', authHeader(ctx.jwt, batWorker));
      expect(r.status).toBe(200);
    }
    const ownerHistory = await http().get('/tasks/history?range=week').set('Authorization', authHeader(ctx.jwt, owner));
    expect(ownerHistory.body.map((t: { id: string }) => t.id)).not.toContain(res.body.id);
    const myHistory = await http().get('/tasks/history?range=week').set('Authorization', authHeader(ctx.jwt, batWorker));
    expect(myHistory.body.map((t: { id: string }) => t.id)).toContain(res.body.id);

    const pending = await http().get('/tasks/pending').set('Authorization', authHeader(ctx.jwt, owner));
    expect(pending.status).toBe(200);
    const row = pending.body.find((t: { id: string }) => t.id === res.body.id);
    expect(row.createdBy).toEqual({ id: batWorker.id, name: batWorker.name, role: 'worker', line: 'bat' });
  });

  it('chủ xưởng bật tự duyệt → việc tự ghi vào thẳng danh sách; GET /users trả autoApprove', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);

    const toggle = await http()
      .patch(`/users/${worker.id}/auto-approve`)
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ autoApprove: true });
    expect(toggle.status).toBe(200);
    expect(toggle.body.autoApprove).toBe(true);

    const users = await http().get('/users').set('Authorization', authHeader(ctx.jwt, owner));
    expect(users.body.find((u: { id: string }) => u.id === worker.id).autoApprove).toBe(true);

    const res = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, worker))
      .send({ content: 'May 5 áo gấp', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(res.status).toBe(201);
    taskIds.push(res.body.id);
    expect(res.body).toMatchObject({ line: 'may_va', approval: 'approved', source: 'self' });

    const all = await http().get('/tasks').set('Authorization', authHeader(ctx.jwt, owner));
    expect(all.body.map((t: { id: string }) => t.id)).toContain(res.body.id);
  });

  it('điều phối tự ghi việc → mảng bạt (không có line); thợ đệm → 400; owner → 403; ghi cho người khác → 403; hạn quá khứ → 400', async () => {
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator' });
    const demWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['may'] });
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const other = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(coordinator.id, demWorker.id, owner.id, other.id);

    const coord = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, coordinator))
      .send({ content: 'Đo bạt nhà ông Tư' });
    expect(coord.status).toBe(201);
    taskIds.push(coord.body.id);
    expect(coord.body).toMatchObject({ line: 'bat', approval: 'pending' });

    const dem = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, demWorker))
      .send({ content: 'Việc đệm tự ghi' });
    expect(dem.status).toBe(400);
    expect(dem.body.message).toBe('Việc đệm đi theo đơn — nhận ở hàng đợi nhóm');

    const byOwner = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Chủ xưởng tự ghi' });
    expect(byOwner.status).toBe(403);

    const forOther = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, coordinator))
      .send({ content: 'Ghi hộ người khác', assigneeIds: [other.id] });
    expect(forOther.status).toBe(403);

    const past = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, other))
      .send({ content: 'Hạn đã qua', dueAt: '2020-01-01T00:00:00.000Z' });
    expect(past.status).toBe(400);

    const tooLong = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, other))
      .send({ content: 'a'.repeat(201) });
    expect(tooLong.status).toBe(400);

    const blank = await http()
      .post('/tasks/self')
      .set('Authorization', authHeader(ctx.jwt, other))
      .send({ content: '   ' });
    expect(blank.status).toBe(400);

    // Không có việc nào lọt vào DB từ các request bị chặn.
    const leaked = await ctx.prisma.task.count({ where: { createdById: { in: [demWorker.id, owner.id, other.id] } } });
    expect(leaked).toBe(0);
  });

  it('duyệt / không duyệt: chỉ pending → approved|rejected, lần hai → 409; worker gọi → 403; không tồn tại → 404', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);

    const mk = async (content: string) => {
      const r = await http().post('/tasks/self').set('Authorization', authHeader(ctx.jwt, worker)).send({ content });
      taskIds.push(r.body.id);
      return r.body.id as string;
    };
    const a = await mk('Việc sẽ được duyệt');
    const b = await mk('Việc sẽ bị từ chối');

    const byWorker = await http().post(`/tasks/${a}/approve`).set('Authorization', authHeader(ctx.jwt, worker));
    expect(byWorker.status).toBe(403);
    const pendingByWorker = await http().get('/tasks/pending').set('Authorization', authHeader(ctx.jwt, worker));
    expect(pendingByWorker.status).toBe(403);

    const ok = await http().post(`/tasks/${a}/approve`).set('Authorization', authHeader(ctx.jwt, owner));
    expect(ok.status).toBe(201);
    expect(ok.body.approval).toBe('approved');
    const again = await http().post(`/tasks/${a}/approve`).set('Authorization', authHeader(ctx.jwt, owner));
    expect(again.status).toBe(409);
    const rejectApproved = await http().post(`/tasks/${a}/reject`).set('Authorization', authHeader(ctx.jwt, owner));
    expect(rejectApproved.status).toBe(409);

    // Hai chủ cùng bấm gần như đồng thời — đúng MỘT request thắng.
    const [r1, r2] = await Promise.all([
      http().post(`/tasks/${b}/reject`).set('Authorization', authHeader(ctx.jwt, owner)),
      http().post(`/tasks/${b}/approve`).set('Authorization', authHeader(ctx.jwt, owner)),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    // Chuẩn hoá cho các kiểm bên dưới: đảm bảo b ở trạng thái rejected.
    await ctx.prisma.task.update({ where: { id: b }, data: { approval: 'rejected' } });

    const all = await http().get('/tasks').set('Authorization', authHeader(ctx.jwt, owner));
    const allIds = all.body.map((t: { id: string }) => t.id);
    expect(allIds).toContain(a);
    expect(allIds).not.toContain(b);

    // Bị từ chối: rời "Việc của tôi", chỉ còn ở lịch sử của chính người ghi.
    const mine = await http().get('/tasks/mine').set('Authorization', authHeader(ctx.jwt, worker));
    expect(mine.body.map((t: { id: string }) => t.id)).not.toContain(b);
    const myHistory = await http().get('/tasks/history?range=week').set('Authorization', authHeader(ctx.jwt, worker));
    const rejectedRow = myHistory.body.find((t: { id: string }) => t.id === b);
    expect(rejectedRow?.approval).toBe('rejected');

    const missing = await http()
      .post('/tasks/00000000-0000-4000-8000-000000000000/approve')
      .set('Authorization', authHeader(ctx.jwt, owner));
    expect(missing.status).toBe(404);
  });

  it('chỉ owner bật/tắt tự duyệt; đích là owner → 404', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'bat' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator' });
    userIds.push(owner.id, worker.id, coordinator.id);

    const byCoordinator = await http()
      .patch(`/users/${worker.id}/auto-approve`)
      .set('Authorization', authHeader(ctx.jwt, coordinator))
      .send({ autoApprove: true });
    expect(byCoordinator.status).toBe(403);

    const toOwner = await http()
      .patch(`/users/${owner.id}/auto-approve`)
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ autoApprove: true });
    expect(toOwner.status).toBe(404);

    const badBody = await http()
      .patch(`/users/${coordinator.id}/auto-approve`)
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ autoApprove: 'có' });
    expect(badBody.status).toBe(400);

    const fresh = await ctx.prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
    expect(fresh.autoApprove).toBe(false);
  });

  it('ký tự NUL → 400 (không 500), hạn quá 2 năm → 400, việc đã không duyệt không nhận mốc (409)', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);
    const w = authHeader(ctx.jwt, worker);

    const nul = await http().post('/tasks/self').set('Authorization', w).send({ content: 'vá áo lỗi' });
    expect(nul.status).toBe(400);
    const nulOwner = await http()
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'may áo lỗi', line: 'may_va', assigneeIds: [worker.id] });
    expect(nulOwner.status).toBe(400);

    const far = await http().post('/tasks/self').set('Authorization', w).send({ content: 'hạn xa', dueAt: '9999-12-31T00:00:00Z' });
    expect(far.status).toBe(400);
    const bad = await http().post('/tasks/self').set('Authorization', w).send({ content: 'hạn sai', dueAt: '2026-13-45' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toContain('quá khứ');

    const created = await http().post('/tasks/self').set('Authorization', w).send({ content: 'việc sẽ bị không duyệt' });
    expect(created.status).toBe(201);
    taskIds.push(created.body.id);
    const rej = await http().post(`/tasks/${created.body.id}/reject`).set('Authorization', authHeader(ctx.jwt, owner));
    expect(rej.status).toBe(201);
    const ack = await http().patch(`/tasks/${created.body.id}/ack`).set('Authorization', w);
    expect(ack.status).toBe(409);
    // Việc tự ghi bắt đầu ở `acked` với đúng MỘT mốc lúc tạo; bị không duyệt thì không thêm mốc nào.
    expect(created.body.status).toBe('acked');
    expect(await ctx.prisma.taskEvent.count({ where: { taskId: created.body.id } })).toBe(1);
  });

  it('owner đăng ký / xoá push token của máy mình; thợ gọi → 403', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const worker = await createTestUser(ctx.prisma, { role: 'worker', line: 'may_va' });
    userIds.push(owner.id, worker.id);

    const set = await http()
      .put('/users/me/push-token')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ token: 'ExponentPushToken[e2e-owner]' });
    expect(set.status).toBe(200);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).pushToken).toBe('ExponentPushToken[e2e-owner]');

    const cleared = await http().put('/users/me/push-token').set('Authorization', authHeader(ctx.jwt, owner)).send({ token: null });
    expect(cleared.status).toBe(200);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).pushToken).toBeNull();

    const byWorker = await http()
      .put('/users/me/push-token')
      .set('Authorization', authHeader(ctx.jwt, worker))
      .send({ token: 'ExponentPushToken[x]' });
    expect(byWorker.status).toBe(403);
  });

  it('điều phối được giao việc may vá và việc bạt, tự báo nhận/bắt đầu/xong; quyền chia vẫn chỉ mảng bạt', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const coordinator = await createTestUser(ctx.prisma, { role: 'bat_coordinator' });
    userIds.push(owner.id, coordinator.id);

    const mayVa = await http()
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'May 10 vỏ gối', assigneeIds: [coordinator.id] });
    expect(mayVa.status).toBe(201);
    taskIds.push(mayVa.body.id);

    for (const step of ['ack', 'start', 'done']) {
      const r = await http().patch(`/tasks/${mayVa.body.id}/${step}`).set('Authorization', authHeader(ctx.jwt, coordinator));
      expect(r.status).toBe(200);
    }

    const bat = await http()
      .post('/tasks')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ content: 'Bạt che sân', line: 'bat', measurements: '4x5' });
    taskIds.push(bat.body.id);

    // danh sách người nhận việc bạt có điều phối.
    const batWorkers = await http().get('/users/bat-workers').set('Authorization', authHeader(ctx.jwt, owner));
    expect(batWorkers.body.map((u: { id: string }) => u.id)).toContain(coordinator.id);

    const assign = await http()
      .post(`/tasks/${bat.body.id}/assign`)
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({ userIds: [coordinator.id] });
    expect(assign.status).toBe(201);

    const mine = await http().get('/tasks/mine').set('Authorization', authHeader(ctx.jwt, coordinator));
    const mineIds = mine.body.map((t: { id: string }) => t.id);
    expect(mineIds).toEqual(expect.arrayContaining([mayVa.body.id, bat.body.id]));

    // Quyền CHIA không đổi: điều phối vẫn không chia được việc may vá.
    const reassign = await http()
      .post(`/tasks/${mayVa.body.id}/assign`)
      .set('Authorization', authHeader(ctx.jwt, coordinator))
      .send({ userIds: [coordinator.id] });
    expect(reassign.status).toBe(403);
  });
});
