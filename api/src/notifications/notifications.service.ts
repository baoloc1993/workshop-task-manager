import { Injectable, Logger } from '@nestjs/common';
import type { WorkerGroup } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// CAP-TASK-14 (vòng 6) — một chỗ DUY NHẤT gọi Expo Push (ARCHITECTURE.md §8:
// "task-manager-api/src/notifications/ ... Không đọc/ghi bảng Task trực tiếp").
// Không bao giờ throw ra ngoài: "Không được để lỗi push làm hỏng việc tạo task"
// (ARCHITECTURE.md §9) — mọi lỗi chỉ log, người gọi không cần try/catch.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Nhắc một người — mọi máy ĐANG hoạt động của họ (nhiều máy cùng lúc, ARCHITECTURE.md §6).
  async notifyUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
    const pairings = await this.prisma.devicePairing.findMany({
      where: { userId, revokedAt: null, deviceToken: { not: null } },
      select: { deviceToken: true },
    });
    await this.push(pairings.map((p) => ({ to: p.deviceToken as string, title, body, data })));
  }

  // Nhắc mọi người đang hoạt động của một vai — dùng cho "việc bạt mới chờ chia"
  // (không có assignee cụ thể để nhắc riêng từng người). vòng 9: thêm 'owner' cho "việc
  // chờ duyệt" (AC-41).
  async notifyRole(role: 'bat_coordinator' | 'owner', title: string, body: string, data?: Record<string, unknown>) {
    const pairings = await this.prisma.devicePairing.findMany({
      where: {
        revokedAt: null,
        deviceToken: { not: null },
        user: { role, active: true },
      },
      select: { deviceToken: true },
    });
    const tokens = pairings.map((p) => p.deviceToken as string);
    // vòng 9 — owner không có DevicePairing; token nằm ở `User.pushToken` (AC-41).
    if (role === 'owner') {
      const owners = await this.prisma.user.findMany({
        where: { role: 'owner', active: true, pushToken: { not: null } },
        select: { pushToken: true },
      });
      tokens.push(...owners.map((o) => o.pushToken as string));
    }
    await this.push([...new Set(tokens)].map((to) => ({ to, title, body, data })));
  }

  // vòng 7 — CAP-DEM-07 (AC-21): việc hàng-đợi-nhóm mảng đệm không có assignee cụ thể
  // (khác "Việc bạt chờ chia" nhắc theo VAI) — nhắc mọi thợ ĐANG hoạt động thuộc nhóm đó,
  // dùng `hasSome` trên `User.groups` (mảng, một người nhiều nhóm — ARCHITECTURE.md §6).
  async notifyGroup(group: WorkerGroup, title: string, body: string, data?: Record<string, unknown>) {
    const pairings = await this.prisma.devicePairing.findMany({
      where: {
        revokedAt: null,
        deviceToken: { not: null },
        user: { active: true, groups: { has: group } },
      },
      select: { deviceToken: true },
    });
    await this.push(pairings.map((p) => ({ to: p.deviceToken as string, title, body, data })));
  }

  private async push(messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;
    try {
      const token = process.env.EXPO_ACCESS_TOKEN;
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`Expo Push trả về ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      // Không có chuông thì việc vẫn hiện khi công nhân tự mở app (ARCHITECTURE.md §9) —
      // lỗi push không bao giờ được chặn luồng tạo/gán/nhắc việc.
      this.logger.warn(`Gửi Expo Push thất bại: ${e instanceof Error ? e.message : e}`);
    }
  }
}
