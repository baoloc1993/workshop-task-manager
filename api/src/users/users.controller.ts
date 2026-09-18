import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UpdateGroupsDto } from './dto/update-groups.dto.js';
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
    // AC-32 (vòng 8) — S5 giờ gọi `?paired=all` để nhận cờ `paired` theo từng người,
    // thay vì danh sách bị lọc cứng khiến người đã ghép máy biến mất.
    if (paired === 'all') return this.users.listAllWithPairedFlag();
    return this.users.listAll();
  }

  // CAP-TASK-06 (AC-13) — S10 "Chọn thợ để giao". PERSONAS.md §2: điều phối không được xem
  // danh sách toàn xưởng ("không chạm mảng may vá"), nên endpoint riêng, hẹp hơn `GET /users`.
  @Roles('owner', 'bat_coordinator')
  @Get('bat-workers')
  batWorkers() {
    return this.users.listActiveBatWorkers();
  }

  // S26 "Phân vai thợ" (CAP-DEM-07, AC-21) — hiệu lực ngay, không nút "Lưu" riêng.
  @Roles('owner')
  @Patch(':id/groups')
  updateGroups(@Param('id') id: string, @Body() dto: UpdateGroupsDto) {
    return this.users.updateGroups(id, dto.groups);
  }
}
