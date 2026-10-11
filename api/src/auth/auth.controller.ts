import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AuthService } from './auth.service.js';
import { CreatePairingDto } from './dto/create-pairing.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RedeemPairingDto } from './dto/redeem-pairing.dto.js';

// 10 lần/phút
// theo IP — đủ cho người thật gõ sai vài lần, chặn dò brute-force (đã đo:
// 50 lần/2.37s không bị chặn trước khi có dòng này). `/auth/pairings/redeem` siết chặt hơn
// vì mã chỉ 6 chữ số (≤1 triệu khả năng, không giới hạn số lần thử theo mã).
const AUTH_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Roles('owner')
  @Post('auth/pairings')
  createPairing(@Body() dto: CreatePairingDto) {
    return this.auth.createPairing(dto);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('auth/pairings/redeem')
  redeemPairing(@Body() dto: RedeemPairingDto) {
    return this.auth.redeemPairing(dto);
  }

  @Roles('owner')
  @Get('auth/devices')
  listDevices() {
    return this.auth.listDevices();
  }

  @Roles('owner')
  @Post('auth/devices/:id/revoke')
  revokeDevice(@Param('id') id: string) {
    return this.auth.revokeDevice(id);
  }

  // máy chủ xưởng mất/lộ
  // thì đây là cách duy nhất vô hiệu hoá token cũ mà không phải đổi JWT_SECRET (kéo theo
  // đăng xuất toàn bộ công nhân/điều phối đang dùng DevicePairing).
  @Roles('owner')
  @Post('auth/logout-everywhere')
  logoutEverywhere(@CurrentUser() user: AuthUser) {
    return this.auth.logoutEverywhere(user.userId);
  }
}
