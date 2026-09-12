import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
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

  // CAP-TASK-06 (AC-13) — S9 "Việc bạt chờ chia". Đăng ký TRƯỚC ':id' bên dưới để
  // "bat-queue" không bị nuốt làm tham số id.
  @Roles('owner', 'bat_coordinator')
  @Get('bat-queue')
  batQueue() {
    return this.tasks.findBatQueue();
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

  // CAP-TASK-06 (AC-13) — S10 "Chọn thợ để giao". PERSONAS.md §2: worker không được gọi
  // (kể cả cho việc mảng bạt của chính mình) — chặn ở đây, không chỉ ẩn nút trên app.
  @Roles('owner', 'bat_coordinator')
  @Post(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignTaskDto) {
    return this.tasks.assign(user, id, dto);
  }
}
