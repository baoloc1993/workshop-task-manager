import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
}
