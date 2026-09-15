import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskEventKind, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';

const HISTORY_WINDOW_DAYS: Record<'week' | 'month', number> = { week: 7, month: 30 };

const TASK_INCLUDE = {
  assignees: { include: { user: true } },
  // AC-11 — S7 hiện đủ mốc thời gian; sắp theo thứ tự xảy ra thật.
  events: { orderBy: { at: 'asc' } },
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
    if (assigneeIds.length > 0) {
      const foundCount = await this.prisma.user.count({ where: { id: { in: assigneeIds } } });
      if (foundCount !== assigneeIds.length) {
        throw new BadRequestException('Có người trong danh sách giao việc không tồn tại');
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
    const found = await this.prisma.task.count({
      where: { id: { in: dto.taskIds }, deletedAt: null },
    });
    if (found !== dto.taskIds.length) {
      throw new BadRequestException('Có việc trong danh sách không còn tồn tại');
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
      throw new BadRequestException('Chỉ chia được việc mảng bạt qua đây');
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

    try {
      await this.prisma.taskEvent.create({ data: { taskId: id, userId: user.userId, kind } });
    } catch (e) {
      // (task_id,user_id,kind) đã tồn tại — hai lượt bấm đua nhau tới server cùng lúc
      // (double submit thật, không chỉ double-tap UI). Coi là đã ghi, không lỗi đỏ.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
    }

    return this.prisma.task.update({
      where: { id },
      data: { status: targetStatus },
      include: TASK_INCLUDE,
    });
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
