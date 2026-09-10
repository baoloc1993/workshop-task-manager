import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CreateTaskDto } from './dto/create-task.dto.js';

const TASK_INCLUDE = { assignees: { include: { user: true } } } as const;

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
}
