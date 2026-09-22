import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UpdateGroupsDto } from './dto/update-groups.dto.js';
import { UpdateAutoApproveDto } from './dto/update-auto-approve.dto.js';
import { UpdatePushTokenDto } from './dto/update-push-token.dto.js';
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

  // vòng 9 — AC-41: owner đăng ký push token của máy đang đăng nhập (route tĩnh `me` khai
  // TRƯỚC các route `:id`).
  @Roles('owner')
  @Put('me/push-token')
  updatePushToken(@CurrentUser() user: AuthUser, @Body() dto: UpdatePushTokenDto) {
    return this.users.updatePushToken(user.userId, dto.token ?? null);
  }

  // vòng 9 — CAP-TASK-16 (AC-41, S26): công tắc "Tự duyệt việc tự ghi". PERSONAS.md §2:
  // chỉ owner bật/tắt.
  @Roles('owner')
  @Patch(':id/auto-approve')
  updateAutoApprove(@Param('id') id: string, @Body() dto: UpdateAutoApproveDto) {
    return this.users.updateAutoApprove(id, dto.autoApprove);
  }
}
