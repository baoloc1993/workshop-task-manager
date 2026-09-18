import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskEventKind, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { STEP_GROUP } from '../common/dem-step.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';

const HISTORY_WINDOW_DAYS: Record<'week' | 'month', number> = { week: 7, month: 30 };

const TASK_INCLUDE = {
  // `select` tường minh (không `include: true`) — response `/tasks*` đi thẳng ra client
  // di động, không bao giờ được kéo theo `User.password`/`email` dù assignee đó là ai
  // (SECURITY.md §4, cùng khuôn đã áp cho `AuthService.listDevices()`).
  assignees: { include: { user: { select: { id: true, name: true, role: true, line: true } } } },
  // AC-11 — S7 hiện đủ mốc thời gian; sắp theo thứ tự xảy ra thật.
  events: { orderBy: { at: 'asc' } },
  // vòng 7 (S19/S29) — `select` tường minh, KHÔNG BAO GIỜ gồm `price`/`deposit`/
  // `createdBy` (challenge pha I, DECISIONS.md 2026-09-18: vai worker không được thấy
  // tiền — luật cứng `DESIGN-SYSTEM.md §4d` #9 — và TASK_INCLUDE dùng chung cho MỌI vai).
  order: {
    select: {
      id: true,
      mode: true,
      description: true,
      difficulty: true,
      dueAt: true,
      status: true,
      measurementLength: true,
      measurementDepth: true,
      measurementWidth: true,
      measurementThickness: true,
      measurementPhoto: true,
      hasEmbroidery: true,
      pillows: true,
      deliveryMethod: true,
      customer: { select: { id: true, name: true, phone: true, address: true } },
      route: { select: { id: true, name: true } },
    },
  },
} as const;

// CAP-TASK-11/12/13 (AC-8/9/10) — mỗi kind ứng đúng một status đích, và chỉ hợp lệ khi
// task đang đứng ở status NGAY TRƯỚC nó (ARCHITECTURE.md §6: "status chỉ tiến, không lùi").
const STATUS_FOR_KIND: Record<TaskEventKind, TaskStatus> = {
  acked: 'acked',
  started: 'in_progress',
  done: 'done',
};
const PREV_STATUS_FOR_KIND: Record<TaskEventKind, TaskStatus> = {
  acked: 'new',
  started: 'acked',
  done: 'in_progress',
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly orders: OrdersService,
  ) {}

  // AC-2 + AC-3 — tạo việc bằng tay, giao đích danh cho một hoặc nhiều người.
  // AC-12/AC-13 (vòng 4) — mảng bạt (`line='bat'`) mang số đo và LUÔN tạo không có
  // assignee, rơi vào "Việc bạt chờ chia" (S9) tới khi được giao qua assign() bên dưới.
  async create(owner: AuthUser, dto: CreateTaskDto) {
    const line = dto.line ?? 'may_va';
    const assigneeIds = line === 'bat' ? [] : (dto.assigneeIds ?? []);

    if (line === 'may_va' && assigneeIds.length === 0) {
      throw new BadRequestException('Việc mảng may vá phải giao cho ít nhất một người');
    }

    // dogfood pha I: assigneeIds chứa id không tồn tại rơi thẳng
    // xuống ràng buộc khoá ngoại của Postgres → lộ 500 thay vì lỗi tử tế cho client.
    // Kiểm CẢ role/line/active (không chỉ tồn tại) — review pha P vòng 6: thiếu ràng buộc
    // này cho phép owner tự thêm chính mình (hoặc thợ mảng khác) làm assignee của việc
    // may vá, việc mà `PERSONAS.md §2` không định nghĩa (owner không phải người "nhận việc").
    if (assigneeIds.length > 0) {
      const validWorkers = await this.prisma.user.count({
        where: { id: { in: assigneeIds }, role: 'worker', line: 'may_va', active: true },
      });
      if (validWorkers !== assigneeIds.length) {
        throw new BadRequestException(
          'Có người trong danh sách giao việc không hợp lệ (không phải thợ may vá đang hoạt động)',
        );
      }
    }

    // DESIGN-SYSTEM.md §4c ("thứ tự mặc định là cuối hàng", chốt vòng 1) + DECISIONS.md
    // vòng 5: từ khi có API sắp thứ tự thật (AC-14), việc mới không thể tiếp tục nằm ở
    // mặc định Prisma `0` — sẽ nhảy lên đầu hàng đợi thay vì xuống cuối.
    const { _max } = await this.prisma.task.aggregate({
      where: { deletedAt: null },
      _max: { priority: true },
    });
    const priority = (_max.priority ?? -1) + 1;

    const task = await this.prisma.task.create({
      data: {
        content: dto.content,
        line,
        // ARCHITECTURE.md §6: "measurements chỉ dùng cho line = bat" — bỏ qua nếu client
        // lỡ gửi số đo cho việc may vá.
        measurements: line === 'bat' ? dto.measurements?.trim() || null : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        priority,
        source: 'manual',
        createdById: owner.userId,
        assignees: assigneeIds.length
          ? { create: assigneeIds.map((userId) => ({ userId, assignedById: owner.userId })) }
          : undefined,
      },
      include: TASK_INCLUDE,
    });

    // CAP-TASK-14 (vòng 6) — nhắc ngay khi vừa phát việc (ARCHITECTURE.md §7 luồng A bước 5
    // / luồng B bước 5). Giao đích danh → nhắc thẳng người nhận; việc bạt rơi vào hàng đợi
    // (chưa assignee) → nhắc bat_coordinator đi chia. Không await chặn response — lỗi push
    // không được làm hỏng việc tạo task (ARCHITECTURE.md §9).
    if (assigneeIds.length > 0) {
      for (const userId of assigneeIds) {
        void this.notifications.notifyUser(userId, 'Việc mới', task.content, { taskId: task.id });
      }
    } else if (line === 'bat') {
      void this.notifications.notifyRole('bat_coordinator', 'Việc bạt mới chờ chia', task.content, {
        taskId: task.id,
      });
    }

    return task;
  }

  // CAP-TASK-08 (AC-15, S1) + CAP-TASK-07 (AC-14, S4) — cùng MỘT nguồn dữ liệu cho cả hai
  // màn: toàn bộ việc chưa xoá mềm của cả xưởng, sắp theo priority. Gom nhóm "quá hạn/đứng
  // yên · đang làm · chưa ai nhận · xong hôm nay" tính ở CLIENT bằng hàm thuần (DECISIONS.md
  // vòng 5) — đây không phải luật phân quyền, chỉ là cách trình bày.
  findAll() {
    return this.prisma.task.findMany({
      where: { deletedAt: null },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      include: TASK_INCLUDE,
    });
  }

  // CAP-TASK-07 (AC-14) — S4 "Việc nào làm trước": nhận nguyên danh sách task_id theo thứ
  // tự mới, gán lại priority tuần tự theo vị trí (DECISIONS.md vòng 5 — không cộng dồn/diff).
  async reorder(dto: ReorderTasksDto) {
    // DECISIONS.md vòng 5: hợp đồng là "gửi NGUYÊN danh sách", không phải một tập con —
    // server phải TỰ kiểm chứ không chỉ tin client (review pha P vòng 6). Thiếu dòng này,
    // một client thứ hai (vd. owner-dashboard vòng 8) gửi thiếu sẽ làm priority đụng nhau
    // giữa việc có mặt và việc bị bỏ sót trong danh sách.
    const active = await this.prisma.task.findMany({
      where: { status: { not: 'done' }, deletedAt: null },
      select: { id: true },
    });
    const activeIds = new Set(active.map((t) => t.id));
    const sentIds = new Set(dto.taskIds);
    if (activeIds.size !== sentIds.size || [...activeIds].some((id) => !sentIds.has(id))) {
      throw new BadRequestException('Danh sách phải gồm ĐỦ và ĐÚNG mọi việc chưa xong, không thiếu không thừa');
    }

    await this.prisma.$transaction(
      dto.taskIds.map((id, index) =>
        this.prisma.task.update({ where: { id }, data: { priority: index } }),
      ),
    );

    return this.findAll();
  }

  // CAP-TASK-15 (AC-16) — S16 "Việc đã xong": ma trận theo VAI (PERSONAS.md §2), không phải
  // một danh sách cố định — cùng khuôn với findOne()/findMine() (tự rẽ nhánh theo user.role
  // thay vì @Roles ở controller). Lọc theo TaskAssignee HIỆN TẠI, không theo "ai từng làm"
  // (challenge pha I, STATE.md 2026-09-12 — nhất quán với findMine()).
  async history(user: AuthUser, range: 'week' | 'month') {
    const since = new Date(Date.now() - HISTORY_WINDOW_DAYS[range] * 24 * 60 * 60 * 1000);
    const doneEventFilter = { events: { some: { kind: 'done' as const, at: { gte: since } } } };

    const where: Prisma.TaskWhereInput = { deletedAt: null, status: 'done', ...doneEventFilter };
    if (user.role === 'worker') {
      where.assignees = { some: { userId: user.userId } };
    } else if (user.role === 'bat_coordinator') {
      where.OR = [{ assignees: { some: { userId: user.userId } } }, { line: 'bat' }];
    }
    // owner: không lọc thêm — toàn xưởng (PERSONAS.md §2).

    const tasks = await this.prisma.task.findMany({ where, include: TASK_INCLUDE });
    // "Mới nhất trước" tính theo mốc XONG thật (TaskEvent.done.at), không phải updatedAt —
    // updatedAt đổi cả khi owner chỉ sửa nội dung/ưu tiên, không liên quan gì tới lịch sử.
    return tasks.sort((a, b) => doneAt(b).localeCompare(doneAt(a)));
  }

  // CAP-TASK-06 (AC-13) — S9 "Việc bạt chờ chia": TOÀN BỘ việc mảng bạt còn hiệu lực, cả
  // chưa chia lẫn đã chia trong nhóm (PROTOTYPE.md §1 S9 — client tự tách hai mục theo
  // assignees.length). PERSONAS.md §2 giới hạn ai gọi được ở @Roles trong controller.
  findBatQueue() {
    return this.prisma.task.findMany({
      where: { deletedAt: null, line: 'bat' },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      include: TASK_INCLUDE,
    });
  }

  // CAP-TASK-06 (AC-13) — S10 "Chọn thợ để giao": owner|bat_coordinator chọn 1..n thợ bạt
  // ĐANG HOẠT ĐỘNG cho một việc mảng bạt. Chưa từng có DECISIONS.md nào chốt việc chia lại
  // một việc bạt đã có người đụng vào (ack/bắt đầu) — quyết ở đây: cho phép, GHI ĐÈ toàn bộ
  // tập assignee cũ bằng lựa chọn mới nhất, không cộng dồn (đúng tinh thần ARCHITECTURE.md
  // §6 "Sửa đồng thời": không khoá, bản ghi sau thắng). `status`/`TaskEvent` của người bị
  // gỡ vẫn giữ nguyên (không xoá cứng) — quy mô xưởng nhỏ, tần suất ca này thấp, và đây không
  // phải AC nào của vòng 4 nên không xây thêm hàng rào cho một tình huống chưa ai xác nhận
  // cần. Xem context/DECISIONS.md (vòng 4).
  async assign(user: AuthUser, id: string, dto: AssignTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task || task.deletedAt) throw new NotFoundException('Không tìm thấy việc này');
    if (task.line !== 'bat') {
      // 403 (không phải 400) — đây là ranh giới VAI (PERSONAS.md §2: "Điều phối KHÔNG được
      // chạm mảng may vá"), không phải lỗi định dạng input (review pha P vòng 6, đã ghi
      // nhận từ dogfood vòng 6 đợt 2 — mã lỗi cũ 400 không nhất quán với mọi ca 403 khác).
      throw new ForbiddenException('Chỉ chia được việc mảng bạt qua đây');
    }

    const workers = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds }, role: 'worker', line: 'bat', active: true },
      select: { id: true },
    });
    if (workers.length !== dto.userIds.length) {
      throw new BadRequestException('Có thợ trong danh sách không hợp lệ (không phải thợ bạt đang hoạt động)');
    }

    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({ where: { taskId: id } }),
      this.prisma.taskAssignee.createMany({
        data: dto.userIds.map((userId) => ({ taskId: id, userId, assignedById: user.userId })),
      }),
    ]);

    // CAP-TASK-14 — điều phối vừa chia xong thì thợ bạt được chọn phải biết ngay, giống hệt
    // cách giao đích danh mảng may vá đã nhắc ở create(). Gửi lại cả khi chia lại (đổi
    // người) — vô hại, đúng tinh thần "gửi hai lần không sao" (ARCHITECTURE.md §6).
    for (const userId of dto.userIds) {
      void this.notifications.notifyUser(userId, 'Việc bạt mới', task.content, { taskId: id });
    }

    return this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  }

  // AC-4 — S6 "Việc của tôi": chỉ việc của chính người gọi, không qua tham số lọc nào
  // mà client tự truyền (chặn ở server, không chỉ ẩn ở UI — PERSONAS.md §2).
  findMine(user: AuthUser) {
    return this.prisma.task.findMany({
      where: { deletedAt: null, assignees: { some: { userId: user.userId } } },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
      include: TASK_INCLUDE,
    });
  }

  // S7 — chi tiết việc: owner xem mọi việc, người khác chỉ xem việc của chính mình.
  async findOne(user: AuthUser, id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task || task.deletedAt) throw new NotFoundException('Không tìm thấy việc này');

    const isOwner = user.role === 'owner';
    const isAssignee = task.assignees.some((a) => a.userId === user.userId);
    // CAP-TASK-06 (vòng 4) — PERSONAS.md §2 "Xem việc của người khác": bat_coordinator được
    // xem MỌI việc mảng bạt (không chỉ việc của chính mình), kể cả chưa/không phải người
    // được giao — đây là điều kiện để mở S10 "Chọn thợ để giao" từ S9. Bug thật: thiếu
    // dòng này khiến điều phối bị 403 ngay khi mở bất kỳ việc bạt nào không phải của mình
    // (dogfood pha I vòng 4).
    const isBatCoordinatorOnBatTask = user.role === 'bat_coordinator' && task.line === 'bat';
    if (!isOwner && !isAssignee && !isBatCoordinatorOnBatTask) {
      throw new ForbiddenException('Không được xem việc của người khác');
    }
    return task;
  }

  // CAP-TASK-14 (vòng 6) — nguồn dữ liệu cho RemindersService (`src/tasks/reminders.service.ts`).
  // Sống ở TasksService, không phải notifications/, vì đây là truy vấn trên bảng `Task`
  // (ARCHITECTURE.md §8: chỉ tầng của chính domain được chạm bảng của domain đó — review
  // pha P vòng 6 phát hiện bản đầu đặt nhầm ở notifications/).
  async findUnackedNeedingReminder(ackThreshold: Date, cooldownBefore: Date) {
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        status: 'new',
        assignees: { some: { assignedAt: { lte: ackThreshold } } },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: cooldownBefore } }],
      },
      include: { assignees: true },
    });
  }

  async findDueSoonNeedingReminder(dueBefore: Date, cooldownBefore: Date) {
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        status: { not: 'done' },
        dueAt: { not: null, lte: dueBefore },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: cooldownBefore } }],
      },
      include: { assignees: true },
    });
  }

  async markReminded(taskId: string): Promise<void> {
    await this.prisma.task.update({ where: { id: taskId }, data: { lastReminderAt: new Date() } });
  }

  // AC-8/9/10 — nhận / bắt đầu / xong, ≤2 chạm, mỗi thao tác một nút theo đúng trạng thái
  // hiện tại (PROTOTYPE.md §1 C1). CAP-TASK-09: mốc thời gian ghi ngầm qua TaskEvent.
  // PERSONAS.md §2: owner KHÔNG được gọi (chặn ở @Roles trong controller); ở đây còn phải
  // chặn việc-của-người-khác — công nhân/điều phối chỉ báo trạng thái việc của chính mình.
  async advance(user: AuthUser, id: string, kind: TaskEventKind) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task || task.deletedAt) throw new NotFoundException('Không tìm thấy việc này');

    const isAssignee = task.assignees.some((a) => a.userId === user.userId);
    if (!isAssignee) {
      throw new ForbiddenException('Không được báo trạng thái việc của người khác');
    }

    const targetStatus = STATUS_FOR_KIND[kind];
    // Bấm lại khi đã ở trạng thái đích (hoặc đã đi xa hơn — vd F5 gọi lại "ack" sau khi đã
    // "start") không sinh thêm mốc, không báo lỗi (ARCHITECTURE.md §6 "Gửi hai lần").
    if (task.status === targetStatus || isPastStatus(task.status, targetStatus)) {
      return task;
    }
    if (task.status !== PREV_STATUS_FOR_KIND[kind]) {
      throw new BadRequestException('Việc chưa ở đúng bước để báo trạng thái này');
    }
    // CAP-DEM-02 (AC-19) — "Ảnh là BẮT BUỘC với bộ khó" (`_PROPOSAL.md`): chặn ngay lúc
    // báo XONG bước "đi đo", không chặn lúc lưu số đo (S20 phải luôn lưu nháp được, kể cả
    // chưa xong — DECISIONS.md vòng 7, xem UpdateMeasurementsDto).
    if (kind === 'done' && task.step === 'do' && task.order?.difficulty === 'kho' && !task.order.measurementPhoto) {
      throw new BadRequestException('Bộ khó bắt buộc chụp ảnh tờ đo trước khi báo xong');
    }

    try {
      await this.prisma.taskEvent.create({ data: { taskId: id, userId: user.userId, kind } });
    } catch (e) {
      // (task_id,user_id,kind) đã tồn tại — hai lượt bấm đua nhau tới server cùng lúc
      // (double submit thật, không chỉ double-tap UI). Coi là đã ghi, không lỗi đỏ.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: targetStatus },
      include: TASK_INCLUDE,
    });

    // ARCHITECTURE.md §7 luồng D bước 5-6 — quy luật vòng đời ĐƠN sống ở orders/
    // (ranh giới domain, ARCHITECTURE.md §8). Không await chặn response: một Order bị
    // lỗi cập nhật không được làm hỏng việc vừa báo xong đã ghi nhận thành công.
    if (kind === 'done' && task.line === 'dem' && task.orderId) {
      void this.orders.onDemTaskDone(id).catch(() => {});
    }

    return updated;
  }

  // CAP-DEM-07 (AC-21) — S22 "Việc nhóm chờ nhận": TOÀN BỘ task line=dem, chưa xong, mà
  // `step` khớp BẤT KỲ nhóm nào của người gọi (DECISIONS.md vòng 7 — hợp/union, không
  // chọn 1 nhóm). Gồm cả việc ĐÃ có người nhận (client tự tách "chờ" / "đang có người làm").
  findDemQueue(user: AuthUser) {
    if (user.groups.length === 0) return [];
    const steps = (Object.keys(STEP_GROUP) as (keyof typeof STEP_GROUP)[]).filter((step) =>
      user.groups.includes(STEP_GROUP[step]),
    );
    return this.prisma.task.findMany({
      where: { deletedAt: null, line: 'dem', status: { not: 'done' }, step: { in: steps } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
      include: TASK_INCLUDE,
    });
  }

  // CAP-DEM-07 (AC-21) — "Nhận việc này": giành chỗ, tối đa 1 assignee (khác hẳn assign()
  // của mảng bạt — ghi đè, N assignee). Request thứ hai cho cùng task 409, không ghi đè
  // (ARCHITECTURE.md §6 ca biên "Hai thợ cùng nhóm chạm Nhận việc gần như đồng thời").
  async claim(user: AuthUser, id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: { assignees: true } });
    if (!task || task.deletedAt) throw new NotFoundException('Không tìm thấy việc này');
    if (task.line !== 'dem' || !task.step) {
      throw new ForbiddenException('Chỉ nhận được việc hàng đợi nhóm của mảng đệm qua đây');
    }
    const group = STEP_GROUP[task.step as keyof typeof STEP_GROUP];
    if (!group || !user.groups.includes(group)) {
      throw new ForbiddenException('Bạn không thuộc nhóm phụ trách việc này');
    }
    if (task.assignees.length > 0) {
      throw new ConflictException('Việc này đã có người nhận');
    }

    try {
      // dogfood pha I vòng 7: "Nhận việc này"/"Tôi đi đo nhà này" giành
      // chỗ xong, màn liền hiện "Chưa nhận" — cùng một động từ "nhận" cho hai nghĩa khác
      // nhau (giành chỗ vs. ack) làm người mới tưởng chưa bấm gì. Khác `assign()` (người
      // KHÁC giao việc, người nhận còn phải tự ack), claim() là TỰ MÌNH giành — không ai
      // khác có thể đã ack trước, nên gộp claim = ack luôn, bớt một chạm không cần thiết.
      await this.prisma.$transaction([
        this.prisma.taskAssignee.create({ data: { taskId: id, userId: user.userId, assignedById: user.userId } }),
        this.prisma.taskEvent.create({ data: { taskId: id, userId: user.userId, kind: 'acked' } }),
        this.prisma.task.update({ where: { id }, data: { status: 'acked' } }),
      ]);
    } catch (e) {
      // Đua nhau tới server cùng lúc — ràng buộc duy nhất (task_id,user_id) hoặc việc vừa
      // bị người khác giành ngay giữa lúc kiểm assignees.length ở trên và lúc create() này.
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ConflictException('Việc này đã có người nhận');
      }
      throw e;
    }

    return this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  }
}

const STATUS_ORDER: Record<TaskStatus, number> = { new: 0, acked: 1, in_progress: 2, done: 3 };
function isPastStatus(current: TaskStatus, target: TaskStatus): boolean {
  return STATUS_ORDER[current] > STATUS_ORDER[target];
}

// CAP-TASK-15 (AC-16) — mốc "xong" thật của một việc, dùng để sắp lịch sử mới nhất trước.
function doneAt(task: { events: { kind: TaskEventKind; at: Date }[] }): string {
  return (task.events.find((e) => e.kind === 'done')?.at ?? new Date(0)).toISOString();
}
