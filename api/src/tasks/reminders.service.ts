import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from './tasks.service.js';

// "nhắc việc khi chưa ack hoặc sắp tới hạn". Không tài
// liệu nào chốt sẵn ngưỡng thời gian — quyết ở đây, ghi
// 2026-09-15: xưởng nhỏ, không cần độ chính xác phút — poll đơn giản bằng
// setInterval thay vì thêm dependency @nestjs/schedule cho một job duy nhất (luật
// "không thêm trừu tượng ngoài nhu cầu"). Sống ở `tasks/` (không phải `notifications/`)
// vì đọc/ghi bảng Task.
const POLL_INTERVAL_MS = 15 * 60_000; // 15 phút — đủ gần thời gian thực cho quy mô này
const ACK_REMINDER_AFTER_MS = 2 * 60 * 60_000; // 2 giờ chưa ai bấm "Nhận việc"
const DUE_SOON_WINDOW_MS = 2 * 60 * 60_000; // còn ≤2 giờ tới hạn
const REMINDER_COOLDOWN_MS = 2 * 60 * 60_000; // không nhắc lại cùng việc trong 2 giờ

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly tasks: TasksService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.warn(`Vòng nhắc việc lỗi: ${e instanceof Error ? e.message : e}`));
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const now = Date.now();
    const cooldownBefore = new Date(now - REMINDER_COOLDOWN_MS);

    await this.remindUnacked(now, cooldownBefore);
    await this.remindDueSoon(now, cooldownBefore);
  }

  // "Chưa ack" — đã giao (có assignee) từ ≥2 giờ, vẫn còn ở status new (chưa ai bấm
  // "Nhận việc"). Việc bạt còn ở hàng đợi (chưa có assignee) không khớp — nó không phải
  // "chưa ack", nó "chưa ai chia" (xem remindDueSoon bên dưới lo phần đó qua due date).
  private async remindUnacked(now: number, cooldownBefore: Date) {
    const threshold = new Date(now - ACK_REMINDER_AFTER_MS);
    const tasks = await this.tasks.findUnackedNeedingReminder(threshold, cooldownBefore);

    for (const task of tasks) {
      for (const a of task.assignees) {
        await this.notifications.notifyUser(a.userId, 'Việc chưa nhận', `Bạn chưa bấm "Nhận việc": ${task.content}`, {
          taskId: task.id,
        });
      }
      await this.tasks.markReminded(task.id);
    }
  }

  // "Sắp tới hạn" — còn ≤2 giờ (hoặc đã quá hạn) mà chưa xong. Có assignee → nhắc thẳng
  // người giữ việc. Việc bạt còn ở hàng đợi (không assignee) → nhắc điều phối/bat_coordinator,
  // đúng vai đang phải hành động (luồng B bước 5).
  private async remindDueSoon(now: number, cooldownBefore: Date) {
    const dueBefore = new Date(now + DUE_SOON_WINDOW_MS);
    const tasks = await this.tasks.findDueSoonNeedingReminder(dueBefore, cooldownBefore);

    for (const task of tasks) {
      if (task.assignees.length > 0) {
        for (const a of task.assignees) {
          await this.notifications.notifyUser(a.userId, 'Sắp tới hạn', `Sắp tới hạn: ${task.content}`, {
            taskId: task.id,
          });
        }
      } else if (task.line === 'bat') {
        await this.notifications.notifyRole(
          'bat_coordinator',
          'Việc bạt sắp tới hạn',
          `Còn chưa ai chia mà sắp tới hạn: ${task.content}`,
          { taskId: task.id },
        );
      }
      await this.tasks.markReminded(task.id);
    }
  }
}
