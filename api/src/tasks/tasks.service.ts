import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskEventKind, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CreateTaskDto } from './dto/create-task.dto.js';

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
  constructor(private readonly prisma: PrismaService) {}

  // AC-2 + AC-3 — tạo việc bằng tay, giao đích danh cho một hoặc nhiều người.
  async create(owner: AuthUser, dto: CreateTaskDto) {
    // dogfood pha I: assigneeIds chứa id không tồn tại rơi thẳng
    // xuống ràng buộc khoá ngoại của Postgres → lộ 500 thay vì lỗi tử tế cho client.
    const foundCount = await this.prisma.user.count({ where: { id: { in: dto.assigneeIds } } });
    if (foundCount !== dto.assigneeIds.length) {
      throw new BadRequestException('Có người trong danh sách giao việc không tồn tại');
    }

    return this.prisma.task.create({
      data: {
        content: dto.content,
        line: 'may_va', // CAP-TASK-06 (mảng bạt) là vòng 4 — xem DECISIONS.md 2026-09-10
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        source: 'manual',
        createdById: owner.userId,
        assignees: {
          create: dto.assigneeIds.map((userId) => ({ userId, assignedById: owner.userId })),
        },
      },
      include: TASK_INCLUDE,
    });
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
    if (!isOwner && !isAssignee) {
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
