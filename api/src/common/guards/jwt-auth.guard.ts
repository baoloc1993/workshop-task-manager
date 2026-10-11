import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

interface JwtPayload {
  sub: string;
  role: string;
  pairingId?: string;
  tokenVersion?: number;
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

    // `User.groups` đổi "hiệu lực ngay", nên
    // không thể nằm trong JWT payload (worker không đăng nhập lại — phiên sống 180 ngày
    // qua DevicePairing). Đọc DB mỗi request, giống hệt cách tokenVersion đã đọc cho owner.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenVersion: true, groups: true },
    });
    if (!user) throw new UnauthorizedException('Người dùng không còn tồn tại');

    // Máy bị thu hồi mất quyền NGAY ở request kế tiếp — chữ ký JWT
    // còn hợp lệ không đủ, thiết bị đã ghép phải kiểm revoked_at ở DB mỗi request.
    if (payload.pairingId) {
      const pairing = await this.prisma.devicePairing.findUnique({
        where: { id: payload.pairingId },
      });
      if (!pairing || pairing.revokedAt) {
        throw new UnauthorizedException('Máy đã bị thu hồi');
      }
    } else {
      // Token owner (đăng nhập email/mật khẩu, không có pairingId nên không đi qua nhánh
      // trên) — chữ ký JWT sống 180 ngày, thu hồi thật sự đi qua `User.tokenVersion`
      // `POST /auth/logout-everywhere`
      // bump field này, làm mọi token owner cũ hết tác dụng ngay ở request kế tiếp.
      if (user.tokenVersion !== (payload.tokenVersion ?? 0)) {
        throw new UnauthorizedException('Phiên đã bị đăng xuất — đăng nhập lại');
      }
    }

    req.user = { userId: payload.sub, role: payload.role, pairingId: payload.pairingId, groups: user.groups };
    return true;
  }
}
