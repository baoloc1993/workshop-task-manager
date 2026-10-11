import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AssignTaskDto } from './dto/assign-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { CreateSelfTaskDto } from './dto/create-self-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Roles('owner')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  // owner ✗
  // (chặn ở đây). Route tĩnh 'self' khác method với ':id' nên không đụng nhau, vẫn đặt
  // trước cho rõ.
  @Roles('worker', 'bat_coordinator')
  @Post('self')
  createSelf(@CurrentUser() user: AuthUser, @Body() dto: CreateSelfTaskDto) {
    return this.tasks.createSelf(user, dto);
  }

  // Đăng ký TRƯỚC ':id' (cùng lý do
  // 'bat-queue').: chỉ owner thấy việc chờ duyệt của người khác.
  @Roles('owner')
  @Get('pending')
  pending() {
    return this.tasks.findPending();
  }

  // toàn bộ việc của xưởng, một nguồn
  // dữ liệu cho cả hai màn.: chỉ owner xem toàn xưởng.
  @Roles('owner')
  @Get()
  findAll() {
    return this.tasks.findAll();
  }

  @Roles('worker', 'bat_coordinator')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.tasks.findMine(user);
  }

  // Đăng ký TRƯỚC ':id' bên dưới để
  // "bat-queue" không bị nuốt làm tham số id.
  @Roles('owner', 'bat_coordinator')
  @Get('bat-queue')
  batQueue() {
    return this.tasks.findBatQueue();
  }

  // Không @Roles: mọi vai đã đăng nhập gọi được,
  // service tự rẽ nhánh theo vai (giống findOne) — là ma trận theo vai, không
  // phải một danh sách cố định.
  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('range') range?: string) {
    if (range !== 'week' && range !== 'month') {
      throw new BadRequestException('range phải là "week" hoặc "month"');
    }
    return this.tasks.history(user, range);
  }

  // chỉ owner đổi thứ tự.
  @Roles('owner')
  @Patch('reorder')
  reorder(@Body() dto: ReorderTasksDto) {
    return this.tasks.reorder(dto);
  }

  // Đăng ký TRƯỚC ':id' bên dưới — cùng lý
  // do 'bat-queue' ở trên (route tĩnh phải đứng trước route có tham số).
  @Roles('worker')
  @Get('dem-queue')
  demQueue(@CurrentUser() user: AuthUser) {
    return this.tasks.findDemQueue(user);
  }

  // Không @Roles ở đây: mọi vai đã đăng nhập gọi được, nhưng service tự lọc
  // owner-hoặc-assignee — đây chính là ca kiểm bắt buộc của
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.findOne(user, id);
  }

  // owner KHÔNG có mặt ở @Roles: cấm owner ack/bắt đầu/xong
  // thay công nhân, chặn ở đây chứ không chỉ ẩn nút trên app.
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

  // worker không được gọi
  // (kể cả cho việc mảng bạt của chính mình) — chặn ở đây, không chỉ ẩn nút trên app.
  @Roles('owner', 'bat_coordinator')
  @Post(':id/assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignTaskDto) {
    return this.tasks.assign(user, id, dto);
  }

  // chỉ owner.
  @Roles('owner')
  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.tasks.decide(id, 'approved');
  }

  @Roles('owner')
  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.tasks.decide(id, 'rejected');
  }

  // "Nhận việc này": giành chỗ, khác hẳn assign() (xem tasks.service.ts).
  @Roles('worker')
  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.claim(user, id);
  }
}
