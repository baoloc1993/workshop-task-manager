import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listAll() {
    return this.prisma.user.findMany({
      where: { role: { not: 'owner' } },
      orderBy: { name: 'asc' },
    });
  }

  // S5 — danh sách người CHƯA có máy đang hoạt động, để chủ xưởng chọn cấp mã.
  // "Chưa có máy" = không có DevicePairing nào đã dùng (usedAt) mà chưa bị thu hồi.
  async listUnpaired() {
    const paired = await this.prisma.devicePairing.findMany({
      where: { usedAt: { not: null }, revokedAt: null },
      select: { userId: true },
    });
    const pairedIds = paired.map((p) => p.userId);
    return this.prisma.user.findMany({
      where: { role: { not: 'owner' }, id: { notIn: pairedIds } },
      orderBy: { name: 'asc' },
    });
  }

  // S10 (CAP-TASK-06, vòng 4) — danh sách thợ bạt đang hoạt động để điều phối/chủ xưởng chọn
  // giao, kèm "đang giữ mấy việc" (PROTOTYPE.md §1 S10, thông tin bắt buộc). `select` riêng
  // (không dùng lại listAll) vì điều phối được gọi endpoint này — không lộ email/password hash
  // của owner qua một đường vòng.
  async listActiveBatWorkers() {
    const workers = await this.prisma.user.findMany({
      where: { role: 'worker', line: 'bat', active: true },
      select: { id: true, name: true, role: true, line: true },
      orderBy: { name: 'asc' },
    });
    if (workers.length === 0) return [];

    const counts = await this.prisma.taskAssignee.groupBy({
      by: ['userId'],
      where: { userId: { in: workers.map((w) => w.id) }, task: { status: { not: 'done' }, deletedAt: null } },
      _count: { _all: true },
    });
    const countByUserId = new Map(counts.map((c) => [c.userId, c._count._all]));
    return workers.map((w) => ({ ...w, activeTaskCount: countByUserId.get(w.id) ?? 0 }));
  }
}
