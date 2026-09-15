import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
