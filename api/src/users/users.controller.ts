import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UsersService } from './users.service.js';

// @Roles ở TỪNG method (không phải class) từ vòng 4 — S10 cần một đường hẹp hơn cho
// bat_coordinator, khác với danh sách toàn xưởng chỉ owner được xem.
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles('owner')
  @Get()
  list(@Query('paired') paired?: string) {
    if (paired === 'false') return this.users.listUnpaired();
    return this.users.listAll();
  }

  // CAP-TASK-06 (AC-13) — S10 "Chọn thợ để giao". PERSONAS.md §2: điều phối không được xem
  // danh sách toàn xưởng ("không chạm mảng may vá"), nên endpoint riêng, hẹp hơn `GET /users`.
  @Roles('owner', 'bat_coordinator')
  @Get('bat-workers')
  batWorkers() {
    return this.users.listActiveBatWorkers();
  }
}
