import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AuthService } from './auth.service.js';
import { CreatePairingDto } from './dto/create-pairing.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RedeemPairingDto } from './dto/redeem-pairing.dto.js';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
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
}
