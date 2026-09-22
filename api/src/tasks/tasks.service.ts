import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TaskEventKind, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { STEP_GROUP } from '../common/dem-step.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { CreateSelfTaskDto } from './dto/create-self-task.dto.js';

// vòng 9 — CAP-TASK-16 (ARCHITECTURE.md §6 "Lọc danh sách"): mọi danh sách TOÀN XƯỞNG /
// của NGƯỜI KHÁC chỉ lấy việc đã duyệt. Việc cũ đều `approved` (default migration) nên kết
// quả cũ không đổi (BACKWARD-COMPATIBILITY-CHECKLIST.md §1). Ngoại lệ duy nhất: danh sách
// của chính người tạo (findMine, history của mình) và S31 (findPending).
const APPROVED_ONLY = { approval: 'approved' } as const;

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
  private readonly logger = new Logger(TasksService.name);

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
      // AC-39 (vòng 9) — điều phối (bat_coordinator) được GIAO việc ở mọi mảng trừ đệm như một
      // thợ (PERSONAS.md §2 "Được chọn làm người nhận"). Quyền CHIA của điều phối không đổi.
      const validWorkers = await this.prisma.user.count({
        where: {
          id: { in: assigneeIds },
          active: true,
          OR:
            line === 'dem'
              ? [{ role: 'worker', line: 'may_va' }]
              : [{ role: 'worker', line: 'may_va' }, { role: 'bat_coordinator' }],
        },
      });
      if (validWorkers !== assigneeIds.length) {
        throw new BadRequestException(
          'Có người trong danh sách giao việc không hợp lệ (không phải thợ may vá / điều phối đang hoạt động)',
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
      where: { deletedAt: null, ...APPROVED_ONLY },
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
    // vòng 9 — "đủ và đúng" tính trên CÙNG tập mà S4 nhận từ findAll() (chỉ việc đã duyệt):
    // việc chờ duyệt không có trên màn thì client không thể gửi nó lên.
    const active = await this.prisma.task.findMany({
      where: { status: { not: 'done' }, deletedAt: null, ...APPROVED_ONLY },
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

    // vòng 9 — CAP-TASK-16: việc của CHÍNH MÌNH thấy mọi approval (kể cả chờ duyệt đã xong);
    // việc của người khác (toàn xưởng / nhóm bạt) chỉ việc đã duyệt.
    const mineDone: Prisma.TaskWhereInput = {
      status: 'done',
      ...doneEventFilter,
      assignees: { some: { userId: user.userId } },
    };
    // AC-41 — "không duyệt → người ghi thấy nhãn 'Chủ không duyệt' ở lịch sử": việc bị từ
    // chối của chính người tạo hiện ở đây DÙ chưa xong (nó đã rời S6), trong cửa sổ thời gian
    // tính theo lúc bị từ chối (updatedAt — không có cột riêng cho mốc duyệt).
    const mineRejected: Prisma.TaskWhereInput = {
      approval: 'rejected',
      createdById: user.userId,
      updatedAt: { gte: since },
    };

    let where: Prisma.TaskWhereInput;
    if (user.role === 'worker') {
      where = { deletedAt: null, OR: [mineDone, mineRejected] };
    } else if (user.role === 'bat_coordinator') {
      where = {
        deletedAt: null,
        OR: [mineDone, mineRejected, { status: 'done', ...doneEventFilter, line: 'bat', ...APPROVED_ONLY }],
      };
    } else {
      // owner: toàn xưởng (PERSONAS.md §2) — chỉ việc đã duyệt.
      where = { deletedAt: null, status: 'done', ...doneEventFilter, ...APPROVED_ONLY };
    }

    const tasks = await this.prisma.task.findMany({ where, include: TASK_INCLUDE });
    // "Mới nhất trước" tính theo mốc XONG thật (TaskEvent.done.at), không phải updatedAt —
    // updatedAt đổi cả khi owner chỉ sửa nội dung/ưu tiên, không liên quan gì tới lịch sử.
    // Việc bị từ chối mà chưa xong (vòng 9) không có mốc xong → dùng updatedAt (lúc từ chối).
    return tasks.sort((a, b) => historyAt(b).localeCompare(historyAt(a)));
  }

  // CAP-TASK-06 (AC-13) — S9 "Việc bạt chờ chia": TOÀN BỘ việc mảng bạt còn hiệu lực, cả
  // chưa chia lẫn đã chia trong nhóm (PROTOTYPE.md §1 S9 — client tự tách hai mục theo
  // assignees.length). PERSONAS.md §2 giới hạn ai gọi được ở @Roles trong controller.
  findBatQueue() {
    return this.prisma.task.findMany({
      where: { deletedAt: null, line: 'bat', ...APPROVED_ONLY },
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
    // vòng 9 — ARCHITECTURE.md §6: "source=self ⇔ người tạo = người nhận duy nhất". Chia lại
    // việc tự ghi sẽ phá bất biến đó (việc chờ duyệt cũng không có trên S9).
    if (task.source === 'self') {
      throw new ForbiddenException('Việc thợ tự ghi thuộc về người ghi — không chia lại được');
    }

    // AC-39 (vòng 9) — điều phối cũng là người nhận được việc bạt (kể cả tự chia cho mình).
    const workers = await this.prisma.user.findMany({
      where: {
        id: { in: dto.userIds },
        active: true,
        OR: [{ role: 'worker', line: 'bat' }, { role: 'bat_coordinator' }],
      },
      select: { id: true },
    });
    if (workers.length !== dto.userIds.length) {
      throw new BadRequestException('Có thợ trong danh sách không hợp lệ (không phải thợ bạt / điều phối đang hoạt động)');
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
  // vòng 9 — thấy cả việc tự ghi đang chờ duyệt (nhãn "Chờ chủ duyệt"); việc bị từ chối rời
  // S6, chỉ còn ở lịch sử (ARCHITECTURE.md §6 "Lọc danh sách").
  findMine(user: AuthUser) {
    return this.prisma.task.findMany({
      where: { deletedAt: null, approval: { not: 'rejected' }, assignees: { some: { userId: user.userId } } },
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
    // vòng 9 — trừ việc chưa duyệt / bị từ chối của người khác (PERSONAS.md §2 "Thấy việc
    // chờ duyệt của người khác": điều phối ✗).
    const isBatCoordinatorOnBatTask =
      user.role === 'bat_coordinator' && task.line === 'bat' && task.approval === 'approved';
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
        // vòng 9 — việc bị từ chối đã rời mọi danh sách, không nhắc nữa. Việc chờ duyệt vẫn
        // nhắc chính người ghi (người nhận duy nhất) — họ đang làm thật.
        approval: { not: 'rejected' },
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
        approval: { not: 'rejected' },
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
      // review pha P vòng 7: `.catch(() => {})` cũ nuốt TRẮNG mọi lỗi —
      // một đơn kẹt "chặng 2 done nhưng chưa sinh Task nhồi" (vd mất kết nối DB thoáng qua)
      // sẽ không ai biết để can thiệp. Log lại thay vì im lặng; không throw vì đúng ý ban
      // đầu — một Order lỗi không được làm hỏng response "đã báo xong" vừa ghi nhận thành công.
      void this.orders.onDemTaskDone(id).catch((e: unknown) => {
        this.logger.error(`onDemTaskDone thất bại cho task ${id}: ${e instanceof Error ? e.message : String(e)}`, e instanceof Error ? e.stack : undefined);
      });
    }

    return updated;
  }

  // vòng 9 — CAP-TASK-16 (AC-40, S30): thợ / điều phối tự ghi việc mình đang làm. Người nhận
  // LUÔN là chính người gọi (PERSONAS.md §2 "Tự ghi việc cho người khác" ✗ mọi vai), mảng
  // theo User.line (điều phối không có line → 'bat'), không cho mảng đệm (việc đệm đi theo đơn).
  // Chưa bật tự duyệt → 'pending': vẫn ack/start/done được (thợ đang làm thật —
  // DECISIONS.md 2026-09-22), chỉ chưa lên danh sách toàn xưởng.
  async createSelf(user: AuthUser, dto: CreateSelfTaskDto) {
    if (dto.assigneeIds?.some((id) => id !== user.userId)) {
      throw new ForbiddenException('Chỉ tự ghi được việc cho chính mình');
    }

    // Đọc tươi line/autoApprove (không nằm trong JWT) — công tắc S26 hiệu lực ngay.
    const me = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, name: true, line: true, autoApprove: true },
    });
    if (!me) throw new NotFoundException('Không tìm thấy tài khoản');
    if (me.line === 'dem') {
      throw new BadRequestException('Việc đệm đi theo đơn — nhận ở hàng đợi nhóm');
    }
    const line = me.line ?? 'bat';
    const approval = me.autoApprove ? 'approved' : 'pending';

    // Cùng khuôn create(): việc mới xuống cuối hàng ưu tiên, để khi được duyệt nó nằm cuối S4.
    const { _max } = await this.prisma.task.aggregate({
      where: { deletedAt: null },
      _max: { priority: true },
    });

    const task = await this.prisma.task.create({
      data: {
        content: dto.content,
        line,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        priority: (_max.priority ?? -1) + 1,
        source: 'self',
        approval,
        createdById: me.id,
        assignees: { create: [{ userId: me.id, assignedById: me.id }] },
      },
      include: TASK_INCLUDE,
    });

    // AC-41 — "có việc mới chờ duyệt → push tới chủ xưởng". Không await chặn response, lỗi
    // push không làm hỏng việc tạo task (ARCHITECTURE.md §9) — cùng khuôn create().
    if (approval === 'pending') {
      void this.notifications.notifyRole('owner', 'Việc chờ duyệt', `${me.name}: ${task.content}`, {
        taskId: task.id,
      });
    }

    return task;
  }

  // vòng 9 — CAP-TASK-16 (AC-41, S31 "Việc chờ duyệt"): cũ nhất trước (chờ lâu nhất được
  // xử lý trước). Kèm `createdBy` (chỉ id/tên/vai/mảng) cho dòng "ai ghi".
  findPending() {
    return this.prisma.task.findMany({
      where: { deletedAt: null, approval: 'pending' },
      orderBy: [{ createdAt: 'asc' }],
      include: { ...TASK_INCLUDE, createdBy: { select: { id: true, name: true, role: true, line: true } } },
    });
  }

  // vòng 9 — CAP-TASK-16 (AC-41): máy trạng thái chỉ pending → approved|rejected. Chống đua
  // (hai chủ cùng bấm / bấm hai lần — ARCHITECTURE.md §6 ca biên vòng 9) bằng update CÓ
  // ĐIỀU KIỆN: chỉ một request khớp `approval='pending'`, request sau count=0 → 409.
  async decide(id: string, approval: 'approved' | 'rejected') {
    const { count } = await this.prisma.task.updateMany({
      where: { id, deletedAt: null, approval: 'pending' },
      data: { approval },
    });
    if (count === 0) {
      const task = await this.prisma.task.findUnique({ where: { id }, select: { deletedAt: true } });
      if (!task || task.deletedAt) throw new NotFoundException('Không tìm thấy việc này');
      throw new ConflictException('Việc này đã được quyết rồi');
    }
    return this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
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
      where: { deletedAt: null, line: 'dem', status: { not: 'done' }, step: { in: steps }, ...APPROVED_ONLY },
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

    try {
      // review bảo mật pha P vòng 7: kiểm `assignees.length` TRƯỚC rồi mới
      // insert ở một transaction riêng là TOCTOU thật — ràng buộc duy nhất trong DB chỉ chặn
      // (task_id,user_id) TRÙNG, không chặn hai user_id KHÁC NHAU cùng giành một task_id
      // (không giống lỗi double-submit một người bấm 2 lần). Chuyển kiểm + ghi vào MỘT
      // transaction Serializable — Postgres tự phát hiện đụng độ, transaction thua ném lỗi
      // serialization, bắt ở catch bên dưới trả 409 giống hệt ca trùng user cũ.
      await this.prisma.$transaction(
        async (tx) => {
          const fresh = await tx.taskAssignee.findFirst({ where: { taskId: id } });
          if (fresh) throw new ConflictException('Việc này đã có người nhận');
          await tx.taskAssignee.create({ data: { taskId: id, userId: user.userId, assignedById: user.userId } });
          // dogfood pha I vòng 7: "Nhận việc này"/"Tôi đi đo nhà này"
          // giành chỗ xong, màn liền hiện "Chưa nhận" — cùng một động từ "nhận" cho hai
          // nghĩa khác nhau (giành chỗ vs. ack) làm người mới tưởng chưa bấm gì. Khác
          // `assign()` (người KHÁC giao việc, người nhận còn phải tự ack), claim() là TỰ
          // MÌNH giành — không ai khác có thể đã ack trước, nên gộp claim = ack luôn.
          await tx.taskEvent.create({ data: { taskId: id, userId: user.userId, kind: 'acked' } });
          await tx.task.update({ where: { id }, data: { status: 'acked' } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      // Đua nhau tới server cùng lúc — ràng buộc duy nhất (task_id,user_id), hoặc Postgres
      // tự huỷ một trong hai transaction Serializable đụng độ (mã lỗi 40001).
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ConflictException('Việc này đã có người nhận');
      }
      if (e instanceof Prisma.PrismaClientUnknownRequestError && e.message.includes('40001')) {
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
// vòng 9: việc bị từ chối mà chưa xong không có mốc xong → lấy updatedAt (lúc bị từ chối).
function historyAt(task: { updatedAt: Date; events: { kind: TaskEventKind; at: Date }[] }): string {
  return (task.events.find((e) => e.kind === 'done')?.at ?? task.updatedAt).toISOString();
}
