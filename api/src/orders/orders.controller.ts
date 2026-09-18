import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { CutDoneDto } from './dto/cut-done.dto.js';
import { UpdateMeasurementsDto } from './dto/update-measurements.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // CAP-DEM-01 (AC-18) — S18. Chỉ owner ghi đơn.
  @Roles('owner')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  // S17 — chỉ owner (mảng đệm chưa có màn tổng hợp nào cho thợ; thợ dùng /tasks/mine
  // + /tasks/dem-queue, không cần xem TOÀN BỘ đơn).
  @Roles('owner')
  @Get()
  findAll() {
    return this.orders.findAll();
  }

  @Roles('owner')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  // CAP-DEM-02 (AC-19) — S20. Không @Roles: owner HOẶC người đo đang giữ Task 'do' của
  // đơn này (kiểm ở service, giống findOne()/findMine() của TasksService — PERSONAS.md §2
  // là ma trận theo vai/quan hệ, không phải một danh sách cố định).
  @Patch(':id/measurements')
  updateMeasurements(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMeasurementsDto) {
    return this.orders.updateMeasurements(user, id, dto);
  }

  // CAP-DEM-04 (AC-20) — S24. Chỉ owner (DECISIONS.md vòng 7 — không có nhóm "tính cắt").
  @Roles('owner')
  @Post(':id/cut-done')
  cutDone(@Param('id') id: string, @Body() dto: CutDoneDto) {
    return this.orders.cutDone(id, dto);
  }

  // CAP-DEM-05 (AC-23) — S23. Chỉ owner.
  @Roles('owner')
  @Post(':id/delivered')
  delivered(@Param('id') id: string) {
    return this.orders.markDelivered(id);
  }
}
