import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkerGroup } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // `select` tường minh (không trả nguyên entity) — dù `where role != owner` khiến
  // `password` luôn null trong dữ liệu hiện tại, `email` vẫn bị lộ không cần thiết cho
  // một màn chỉ cần tên (cùng khuôn `listActiveBatWorkers()` bên dưới).
  private static readonly SAFE_SELECT = {
    id: true,
    name: true,
    role: true,
    line: true,
    active: true,
    groups: true,
    // S26 hiện trạng thái công tắc "Tự duyệt" (additive).
    autoApprove: true,
  } as const;

  listAll() {
    return this.prisma.user.findMany({
      where: { role: { not: 'owner' } },
      select: UsersService.SAFE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  // "Chưa có máy" = không có DevicePairing nào đã dùng (usedAt) mà chưa bị thu hồi.
  private async pairedUserIds() {
    const paired = await this.prisma.devicePairing.findMany({
      where: { usedAt: { not: null }, revokedAt: null },
      select: { userId: true },
    });
    return new Set(paired.map((p) => p.userId));
  }

  // danh sách người CHƯA có máy đang hoạt động, để chủ xưởng chọn cấp mã.
  async listUnpaired() {
    const pairedIds = await this.pairedUserIds();
    return this.prisma.user.findMany({
      where: { role: { not: 'owner' }, id: { notIn: [...pairedIds] } },
      select: UsersService.SAFE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  // S5 trước đây lọc `paired=false` nên thợ đã ghép máy BIẾN
  // MẤT khỏi danh sách, chủ xưởng không còn cách nào tìm lại người đó để "Cấp lại mã" khi
  // thợ mất/đổi máy — phải gõ tay tìm qua "Phân vai thợ". Trả TOÀN BỘ kèm cờ `paired`,
  // màn tự hiện đúng trạng thái + nút phù hợp cho từng người thay vì ẩn hẳn.
  async listAllWithPairedFlag() {
    const [users, pairedIds] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { not: 'owner' } },
        select: UsersService.SAFE_SELECT,
        orderBy: { name: 'asc' },
      }),
      this.pairedUserIds(),
    ]);
    return users.map((u) => ({ ...u, paired: pairedIds.has(u.id) }));
  }

  // danh sách thợ bạt đang hoạt động để điều phối/chủ xưởng chọn
  // giao, kèm "đang giữ mấy việc" (thông tin bắt buộc). `select` riêng
  // (không dùng lại listAll) vì điều phối được gọi endpoint này — không lộ email/password hash
  // của owner qua một đường vòng.
  // điều phối (mọi bat_coordinator đang hoạt động) cũng là người nhận việc bạt
  // client phân biệt bằng `role`.
  async listActiveBatWorkers() {
    const workers = await this.prisma.user.findMany({
      where: { active: true, OR: [{ role: 'worker', line: 'bat' }, { role: 'bat_coordinator' }] },
      select: { id: true, name: true, role: true, line: true },
      orderBy: { name: 'asc' },
    });
    if (workers.length === 0) return [];

    // việc tự ghi bị từ chối không còn là việc "đang giữ".
    const counts = await this.prisma.taskAssignee.groupBy({
      by: ['userId'],
      where: {
        userId: { in: workers.map((w) => w.id) },
        task: { status: { not: 'done' }, deletedAt: null, approval: { not: 'rejected' } },
      },
      _count: { _all: true },
    });
    const countByUserId = new Map(counts.map((c) => [c.userId, c._count._all]));
    return workers.map((w) => ({ ...w, activeTaskCount: countByUserId.get(w.id) ?? 0 }));
  }

  // gán thợ vào nhóm chuyên trách mảng đệm.
  // Không giới hạn theo `line` hiện tại: một thợ may vá/bạt vẫn gán được vào nhóm đệm
  // nếu chủ xưởng muốn (xưởng nhỏ, người làm chéo mảng — không tài liệu nào cấm điều này).
  async updateGroups(userId: string, groups: WorkerGroup[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'worker') throw new NotFoundException('Không tìm thấy thợ này');
    return this.prisma.user.update({
      where: { id: userId },
      data: { groups },
      select: UsersService.SAFE_SELECT,
    });
  }

  // Chỉ có nghĩa với worker/bat_coordinator (người tự ghi
  // việc được) — đích là owner hoặc không tồn tại → 404, cùng khuôn updateGroups(). Hiệu lực
  // cho việc tự ghi từ lúc này trở đi; việc đang chờ KHÔNG tự được duyệt.
  async updatePushToken(userId: string, token: string | null) {
    await this.prisma.user.update({ where: { id: userId }, data: { pushToken: token } });
    return { ok: true };
  }

  async updateAutoApprove(userId: string, autoApprove: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || (user.role !== 'worker' && user.role !== 'bat_coordinator')) {
      throw new NotFoundException('Không tìm thấy thợ này');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { autoApprove },
      select: UsersService.SAFE_SELECT,
    });
  }
}
