import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Roles('owner')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Roles('worker', 'bat_coordinator')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.tasks.findMine(user);
  }

  // Không @Roles ở đây: mọi vai đã đăng nhập gọi được, nhưng service tự lọc
  // owner-hoặc-assignee — đây chính là ca kiểm bắt buộc của PERSONAS.md §2.
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.findOne(user, id);
  }

  // AC-8/9/10 — owner KHÔNG có mặt ở @Roles: PERSONAS.md §2 cấm owner ack/bắt đầu/xong
  // thay công nhân, chặn ở đây chứ không chỉ ẩn nút trên app (luật #8 challenge pha V vòng 3).
  @Roles('worker', 'bat_coordinator')
  @Patch(':id/ack')
  ack(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.advance(user, id, 'acked');
  }

  @Roles('worker', 'bat_coordinator')
  @Patch(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.advance(user, id, 'started');
  }

  @Roles('worker', 'bat_coordinator')
  @Patch(':id/done')
  done(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.advance(user, id, 'done');
  }
}
