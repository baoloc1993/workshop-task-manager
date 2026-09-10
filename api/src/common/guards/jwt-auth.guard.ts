import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

interface JwtPayload {
  sub: string;
  role: string;
  pairingId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Thiếu token');

    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    // Máy bị thu hồi mất quyền NGAY ở request kế tiếp (ARCHITECTURE.md §6) — chữ ký JWT
    // còn hợp lệ không đủ, thiết bị đã ghép phải kiểm revoked_at ở DB mỗi request.
    if (payload.pairingId) {
      const pairing = await this.prisma.devicePairing.findUnique({
        where: { id: payload.pairingId },
      });
      if (!pairing || pairing.revokedAt) {
        throw new UnauthorizedException('Máy đã bị thu hồi');
      }
    }

    req.user = { userId: payload.sub, role: payload.role, pairingId: payload.pairingId };
    return true;
  }
}
