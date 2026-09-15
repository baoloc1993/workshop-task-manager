import { Injectable, Logger } from '@nestjs/common';
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
  // (không có assignee cụ thể để nhắc riêng từng người).
  async notifyRole(role: 'bat_coordinator', title: string, body: string, data?: Record<string, unknown>) {
    const pairings = await this.prisma.devicePairing.findMany({
      where: {
        revokedAt: null,
        deviceToken: { not: null },
        user: { role, active: true },
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
