import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { RemindersService } from './reminders.service.js';

@Module({
  providers: [NotificationsService, RemindersService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
