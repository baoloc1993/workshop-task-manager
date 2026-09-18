import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { RemindersService } from './reminders.service.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  // vòng 7 — Tasks phụ thuộc Orders (không phải chiều ngược lại): advance() gọi
  // orders.onDemTaskDone() sau khi một Task line=dem xong (ARCHITECTURE.md §8).
  imports: [NotificationsModule, OrdersModule],
  controllers: [TasksController],
  providers: [TasksService, RemindersService],
})
export class TasksModule {}
