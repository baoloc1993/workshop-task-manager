// Smoke test luồng D — mảng đệm ghế gỗ (ARCHITECTURE.md §7 mục D, PRD.md §3 AC-18..23)
// qua HTTP thật (Supertest → Nest → Postgres thật), không mock. Cộng các ca biên tiền/dữ
// liệu quan trọng nhất của mảng này (double-submit cut-done, claim() đua nhau, khoá sửa số
// đo sau cut-done, phân quyền, field tiền không lộ cho thợ).
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  authHeader,
  bootstrapTestApp,
  cleanupDemTestData,
  cleanupTestData,
  createTestUser,
  type TestCtx,
} from './utils/test-app.js';

// Chặng 2/3 sinh Task qua một lời gọi KHÔNG await (`void this.orders.onDemTaskDone(...)`,
// xem tasks.service.ts `advance()`) — response PATCH .../done trả về trước khi Task/trạng
// thái đơn kế tiếp chắc chắn đã ghi xong. Poll thay vì giả định đồng bộ, đúng hành vi thật.
async function waitFor<T>(fn: () => Promise<T | undefined | null>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: hết thời gian chờ điều kiện xảy ra');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('Luồng D — mảng đệm ghế gỗ (ARCHITECTURE.md §7 mục D)', () => {
  let ctx: TestCtx;
  let app: INestApplication<App>;
  const orderIds: string[] = [];
  const customerIds: string[] = [];
  const userIds: string[] = [];
  const extraTaskIds: string[] = [];

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    app = ctx.app;
  });

  afterAll(async () => {
    await cleanupDemTestData(ctx.prisma, { orderIds, customerIds, userIds, extraTaskIds });
    await cleanupTestData(ctx.prisma, { userIds: [] }); // no-op, giữ khuôn chung nếu về sau thêm taskIds lẻ
    await app.close();
  });

  async function createOrder(owner: { id: string; role: string }, overrides: Record<string, unknown> = {}) {
    const phone = `090${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', authHeader(ctx.jwt, owner))
      .send({
        customer: { name: 'Khách e2e đệm ghế', phone, address: '12 Đường Demo' },
        mode: 'buon',
        description: 'Bộ ghế gỗ 6 món',
        difficulty: 'de',
        price: 5_000_000,
        deposit: 1_000_000,
        ...overrides,
      });
    return res;
  }

  it('luồng D end-to-end: đo → chốt số cắt → chặng 2 song song → tự sinh nhồi → chờ trả → đã trả (đúng thứ tự status, đúng số Task chặng 2)', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const doWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['do'] });
    const mayWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['may'] });
    const catMutWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['cat_mut'] });
    const khauLotWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['khau_lot'] });
    const theuWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['theu'] });
    const nhoiWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['nhoi'] });
    userIds.push(owner.id, doWorker.id, mayWorker.id, catMutWorker.id, khauLotWorker.id, theuWorker.id, nhoiWorker.id);
    const ownerAuth = authHeader(ctx.jwt, owner);

    // 1. Ghi đơn — cờ has_embroidery=true + một gối tựa → phải sinh theu + goi_tua ở chặng 2
    const createRes = await createOrder(owner, {
      hasEmbroidery: true,
      pillows: [{ type: 'back', length: 40, width: 20, count: 1 }],
    });
    expect(createRes.status).toBe(201);
    orderIds.push(createRes.body.id as string);
    expect(createRes.body.status).toBe('moi');
    expect(createRes.body.tasks).toHaveLength(1);
    const doTaskId = createRes.body.tasks[0].id as string;
    expect(createRes.body.tasks[0].step).toBe('do');

    // 2. Người đo (nhóm "đo") nhận việc — claim() gộp ack
    const claimRes = await request(app.getHttpServer())
      .post(`/tasks/${doTaskId}/claim`)
      .set('Authorization', authHeader(ctx.jwt, doWorker));
    expect(claimRes.status).toBe(201);
    expect(claimRes.body.status).toBe('acked');
    expect(claimRes.body.assignees.map((a: { userId: string }) => a.userId)).toEqual([doWorker.id]);

    // 3. Điền số đo + báo xong "đi đo"
    const measureRes = await request(app.getHttpServer())
      .patch(`/orders/${createRes.body.id}/measurements`)
      .set('Authorization', authHeader(ctx.jwt, doWorker))
      .send({ measurementLength: 200, measurementDepth: 90, measurementWidth: 80 });
    expect(measureRes.status).toBe(200);
    expect(measureRes.body.measurementLength).toBe(200);

    const startDo = await request(app.getHttpServer())
      .patch(`/tasks/${doTaskId}/start`)
      .set('Authorization', authHeader(ctx.jwt, doWorker));
    expect(startDo.status).toBe(200);
    const doneDo = await request(app.getHttpServer())
      .patch(`/tasks/${doTaskId}/done`)
      .set('Authorization', authHeader(ctx.jwt, doWorker));
    expect(doneDo.status).toBe(200);
    expect(doneDo.body.status).toBe('done');

    // 4. Owner chốt số cắt → sinh Task chặng 2 song song: may_vai, cat_mut, khau_lot, +theu
    // (has_embroidery), +goi_tua (có gối tựa) — đúng CHAPTER_2_BASE_STEPS + cờ trên đơn.
    const cutDoneRes = await request(app.getHttpServer())
      .post(`/orders/${createRes.body.id}/cut-done`)
      .set('Authorization', ownerAuth)
      .send({ fabricMeters: 12.5, foamSheets: 4 });
    expect(cutDoneRes.status).toBe(201);
    expect(cutDoneRes.body.status).toBe('dang_lam');
    const chapter2Steps = (cutDoneRes.body.tasks as { step: string }[])
      .map((t) => t.step)
      .filter((s) => s !== 'do');
    expect(chapter2Steps.sort()).toEqual(['cat_mut', 'goi_tua', 'khau_lot', 'may_vai', 'theu'].sort());
    for (const t of cutDoneRes.body.tasks as { id: string }[]) extraTaskIds.push(t.id);

    // 5. Mỗi Task chặng 2 hiện ở đúng hàng đợi nhóm — thợ tự nhận/ack/bắt đầu/xong.
    const byStep = (step: string) =>
      (cutDoneRes.body.tasks as { id: string; step: string }[]).find((t) => t.step === step)!;

    const finishTask = async (taskId: string, workerAuth: string) => {
      const claim = await request(app.getHttpServer()).post(`/tasks/${taskId}/claim`).set('Authorization', workerAuth);
      expect(claim.status).toBe(201);
      const start = await request(app.getHttpServer()).patch(`/tasks/${taskId}/start`).set('Authorization', workerAuth);
      expect(start.status).toBe(200);
      const done = await request(app.getHttpServer()).patch(`/tasks/${taskId}/done`).set('Authorization', workerAuth);
      expect(done.status).toBe(200);
      expect(done.body.status).toBe('done');
    };

    // "goi_tua" dùng chung nhóm "may" (ARCHITECTURE.md §6) — cùng người mayWorker làm cả hai,
    // hoàn tất TRƯỚC để tránh claim trùng task khác của cùng người cùng lúc (không liên quan
    // race — chỉ tuần tự hoá test).
    await finishTask(byStep('may_vai').id, authHeader(ctx.jwt, mayWorker));
    await finishTask(byStep('cat_mut').id, authHeader(ctx.jwt, catMutWorker));
    await finishTask(byStep('khau_lot').id, authHeader(ctx.jwt, khauLotWorker));
    await finishTask(byStep('theu').id, authHeader(ctx.jwt, theuWorker));
    await finishTask(byStep('goi_tua').id, authHeader(ctx.jwt, mayWorker));

    // Xong TOÀN BỘ Task chặng 2 → tự sinh đúng MỘT Task "nhồi" (chặng 3).
    const orderId = createRes.body.id as string;
    const nhoiTask = await waitFor(async () => {
      const detail = await request(app.getHttpServer()).get(`/orders/${orderId}`).set('Authorization', ownerAuth);
      const nhoi = (detail.body.tasks as { id: string; step: string }[]).filter((t) => t.step === 'nhoi');
      return nhoi.length === 1 ? nhoi[0] : undefined;
    });
    extraTaskIds.push(nhoiTask.id);
    // Không nhân đôi — kể cả sau khi đã thấy nó, gọi lại vẫn đúng một Task "nhồi".
    const detailAfter = await request(app.getHttpServer()).get(`/orders/${orderId}`).set('Authorization', ownerAuth);
    expect((detailAfter.body.tasks as { step: string }[]).filter((t) => t.step === 'nhoi')).toHaveLength(1);

    // 6. Hoàn tất "nhồi" → Order.status chuyển "cho_tra"
    await finishTask(nhoiTask.id, authHeader(ctx.jwt, nhoiWorker));
    await waitFor(async () => {
      const detail = await request(app.getHttpServer()).get(`/orders/${orderId}`).set('Authorization', ownerAuth);
      return detail.body.status === 'cho_tra' ? detail.body : undefined;
    });

    // 7. Owner báo "đã trả hàng" → status='da_tra' + deposit=price (thu đủ còn lại)
    const deliveredRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/delivered`)
      .set('Authorization', ownerAuth);
    expect(deliveredRes.status).toBe(201);
    expect(deliveredRes.body.status).toBe('da_tra');
    expect(deliveredRes.body.deposit).toBe(deliveredRes.body.price);
  }, 20000);

  it('double-submit trên cut-done: hai request gần như đồng thời chỉ sinh MỘT bộ Task chặng 2, lần thừa không phải 500', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const doWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['do'] });
    userIds.push(owner.id, doWorker.id);
    const ownerAuth = authHeader(ctx.jwt, owner);

    const createRes = await createOrder(owner);
    const orderId = createRes.body.id as string;
    orderIds.push(orderId);
    const doTaskId = createRes.body.tasks[0].id as string;

    await request(app.getHttpServer()).post(`/tasks/${doTaskId}/claim`).set('Authorization', authHeader(ctx.jwt, doWorker));
    await request(app.getHttpServer()).patch(`/tasks/${doTaskId}/start`).set('Authorization', authHeader(ctx.jwt, doWorker));
    await request(app.getHttpServer()).patch(`/tasks/${doTaskId}/done`).set('Authorization', authHeader(ctx.jwt, doWorker));

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post(`/orders/${orderId}/cut-done`)
        .set('Authorization', ownerAuth)
        .send({ fabricMeters: 10, foamSheets: 3 }),
      request(app.getHttpServer())
        .post(`/orders/${orderId}/cut-done`)
        .set('Authorization', ownerAuth)
        .send({ fabricMeters: 10, foamSheets: 3 }),
    ]);

    // Không cái nào được phép 500 dù cả hai đua nhau.
    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);
    // Đúng MỘT trong hai thành công (201); cái còn lại phải bị chặn bằng lỗi rõ ràng (4xx),
    // không phải một bộ Task chặng 2 thứ hai âm thầm tạo ra.
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 400]);

    const mayVaiTasks = await ctx.prisma.task.findMany({ where: { orderId, step: 'may_vai' } });
    for (const t of mayVaiTasks) extraTaskIds.push(t.id);
    // Cả 3 step chặng 2 khác cũng phải đúng một bản mỗi loại — không riêng may_vai.
    const chapter2Tasks = await ctx.prisma.task.findMany({
      where: { orderId, step: { in: ['may_vai', 'cat_mut', 'khau_lot'] } },
    });
    for (const t of chapter2Tasks) extraTaskIds.push(t.id);
    expect(mayVaiTasks).toHaveLength(1);
    expect(chapter2Tasks).toHaveLength(3);
  });

  it('claim() đua nhau: hai thợ CÙNG NHÓM giành một Task hàng đợi — chỉ một thành công, không có 2 TaskAssignee cho cùng task', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const doWorker1 = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['do'] });
    const doWorker2 = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['do'] });
    userIds.push(owner.id, doWorker1.id, doWorker2.id);

    const createRes = await createOrder(owner);
    const orderId = createRes.body.id as string;
    orderIds.push(orderId);
    const doTaskId = createRes.body.tasks[0].id as string;

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post(`/tasks/${doTaskId}/claim`).set('Authorization', authHeader(ctx.jwt, doWorker1)),
      request(app.getHttpServer()).post(`/tasks/${doTaskId}/claim`).set('Authorization', authHeader(ctx.jwt, doWorker2)),
    ]);

    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);
    const statuses = [a.status, b.status].sort();
    // Đúng MỘT request thắng (201), request kia phải bị chặn 409 ("đã có người nhận") —
    // ARCHITECTURE.md §6 ca biên "Hai thợ cùng nhóm chạm Nhận việc gần như đồng thời":
    // "request thứ hai cho cùng task_id bị chặn (409), không ghi đè".
    expect(statuses).toEqual([201, 409]);

    const assignees = await ctx.prisma.taskAssignee.findMany({ where: { taskId: doTaskId } });
    expect(assignees).toHaveLength(1);
  });

  it('khoá sửa số đo sau khi đã cut-done: PATCH /orders/:id/measurements bị chặn (orders.service.ts)', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const doWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['do'] });
    userIds.push(owner.id, doWorker.id);
    const ownerAuth = authHeader(ctx.jwt, owner);

    const createRes = await createOrder(owner);
    const orderId = createRes.body.id as string;
    orderIds.push(orderId);
    const doTaskId = createRes.body.tasks[0].id as string;

    await request(app.getHttpServer()).post(`/tasks/${doTaskId}/claim`).set('Authorization', authHeader(ctx.jwt, doWorker));
    await request(app.getHttpServer()).patch(`/tasks/${doTaskId}/start`).set('Authorization', authHeader(ctx.jwt, doWorker));
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/measurements`)
      .set('Authorization', authHeader(ctx.jwt, doWorker))
      .send({ measurementLength: 150 });
    await request(app.getHttpServer()).patch(`/tasks/${doTaskId}/done`).set('Authorization', authHeader(ctx.jwt, doWorker));

    const cutDoneRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/cut-done`)
      .set('Authorization', ownerAuth)
      .send({ fabricMeters: 8, foamSheets: 2 });
    expect(cutDoneRes.status).toBe(201);
    for (const t of cutDoneRes.body.tasks as { id: string; step: string }[]) {
      if (t.step !== 'do') extraTaskIds.push(t.id);
    }

    const editAfterCutDone = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/measurements`)
      .set('Authorization', ownerAuth)
      .send({ measurementLength: 999 });
    expect([400, 403]).toContain(editAfterCutDone.status);

    const unchanged = await ctx.prisma.order.findUnique({ where: { id: orderId } });
    expect(unchanged?.measurementLength).toBe(150);
  });

  it('phân quyền mảng đệm: thợ ngoài nhóm nào → dem-queue rỗng không lỗi; sai nhóm claim() → 403; non-owner tạo đơn/cut-done → 403', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const noGroupWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: [] });
    const wrongGroupWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['may'] });
    userIds.push(owner.id, noGroupWorker.id, wrongGroupWorker.id);

    // Worker không thuộc nhóm nào → dem-queue trả về rỗng, không lỗi.
    const emptyQueue = await request(app.getHttpServer())
      .get('/tasks/dem-queue')
      .set('Authorization', authHeader(ctx.jwt, noGroupWorker));
    expect(emptyQueue.status).toBe(200);
    expect(emptyQueue.body).toEqual([]);

    // non-owner gọi POST /orders → 403
    const createByWorker = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', authHeader(ctx.jwt, wrongGroupWorker))
      .send({
        customer: { name: 'Khách bị chặn', phone: '0900000000', address: 'x' },
        mode: 'buon',
        description: 'Bộ ghế test phân quyền',
      });
    expect(createByWorker.status).toBe(403);

    const createRes = await createOrder(owner);
    const orderId = createRes.body.id as string;
    orderIds.push(orderId);
    const doTaskId = createRes.body.tasks[0].id as string;

    // Thợ sai nhóm (nhóm "may", không phải "do") claim Task "đi đo" → 403
    const wrongGroupClaim = await request(app.getHttpServer())
      .post(`/tasks/${doTaskId}/claim`)
      .set('Authorization', authHeader(ctx.jwt, wrongGroupWorker));
    expect(wrongGroupClaim.status).toBe(403);
    const assigneesAfter = await ctx.prisma.taskAssignee.findMany({ where: { taskId: doTaskId } });
    expect(assigneesAfter).toHaveLength(0);

    // non-owner gọi POST /orders/:id/cut-done → 403
    const cutDoneByWorker = await request(app.getHttpServer())
      .post(`/orders/${orderId}/cut-done`)
      .set('Authorization', authHeader(ctx.jwt, wrongGroupWorker))
      .send({ fabricMeters: 5, foamSheets: 1 });
    expect(cutDoneByWorker.status).toBe(403);
  });

  it('field tiền không lộ cho thợ: GET /tasks/mine của thợ mảng đệm không có price/deposit/createdBy của order', async () => {
    const owner = await createTestUser(ctx.prisma, { role: 'owner' });
    const doWorker = await createTestUser(ctx.prisma, { role: 'worker', line: 'dem', groups: ['do'] });
    userIds.push(owner.id, doWorker.id);

    const createRes = await createOrder(owner, { price: 7_777_000, deposit: 2_000_000 });
    const orderId = createRes.body.id as string;
    orderIds.push(orderId);
    const doTaskId = createRes.body.tasks[0].id as string;

    await request(app.getHttpServer()).post(`/tasks/${doTaskId}/claim`).set('Authorization', authHeader(ctx.jwt, doWorker));

    const mineRes = await request(app.getHttpServer())
      .get('/tasks/mine')
      .set('Authorization', authHeader(ctx.jwt, doWorker));
    expect(mineRes.status).toBe(200);
    const mine = (mineRes.body as { id: string; order?: Record<string, unknown> }[]).find((t) => t.id === doTaskId);
    expect(mine).toBeDefined();
    expect(mine!.order).toBeDefined();
    expect(mine!.order).not.toHaveProperty('price');
    expect(mine!.order).not.toHaveProperty('deposit');
    expect(mine!.order).not.toHaveProperty('createdBy');
    expect(mine!.order).not.toHaveProperty('createdById');
  });
});
