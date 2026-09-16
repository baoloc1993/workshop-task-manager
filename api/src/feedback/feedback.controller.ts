import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CreateFeedbackDto } from './dto/create-feedback.dto.js';
import { FeedbackService } from './feedback.service.js';

// Không @Roles — mọi vai đã đăng nhập (owner/worker/bat_coordinator) đều gửi được,
// đúng tinh thần "kênh feedback" mở cho tất cả người dùng, không riêng owner.
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto) {
    return this.feedback.create(user.userId, dto);
  }
}
