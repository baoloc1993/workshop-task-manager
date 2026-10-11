import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePairingDto } from './dto/create-pairing.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RedeemPairingDto } from './dto/redeem-pairing.dto.js';

const PAIRING_TTL_MIN = Number(process.env.PAIRING_CODE_TTL_MIN ?? 15);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.role !== 'owner' || !user.password) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Sai email hoặc mật khẩu');

    const token = this.jwt.sign({ sub: user.id, role: user.role, tokenVersion: user.tokenVersion });
    return { token, user: { id: user.id, name: user.name, role: user.role, groups: user.groups } };
  }

  // "Đăng xuất mọi nơi" — chỉ owner mới cần (worker/bat-coordinator đã có
  // "Thu hồi máy" qua DevicePairing). Bump tokenVersion làm MỌI token owner cũ (kể cả
  // token vừa gọi endpoint này) hết tác dụng ngay ở request kế tiếp (JwtAuthGuard).
  async logoutEverywhere(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }

  // Chủ xưởng cấp mã QR cho một người chưa ghép máy. Mã 6 số: hiện thành QR,
  // nhưng vẫn đọc/gõ được nếu camera lỗi — không có đường dự phòng nào khác.
  async createPairing(dto: CreatePairingDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Không tìm thấy người này');

    // Cấp mã mới cho CÙNG một người thì mã cũ chưa dùng phải hết hiệu lực ngay —
    // không thu hồi thì hai mã sống song song,
    // chủ xưởng "bỏ quên" màn QR cũ (không đưa cho ai) vẫn còn dùng được 15 phút.
    await this.prisma.devicePairing.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MIN * 60_000);

    const pairing = await this.prisma.devicePairing.create({
      data: { userId: user.id, code, expiresAt },
    });
    return { pairingId: pairing.id, code, expiresAt, userName: user.name };
  }

  // Người mới quét mã → đổi mã lấy token dài hạn, một lần duy nhất.
  async redeemPairing(dto: RedeemPairingDto) {
    const pairing = await this.prisma.devicePairing.findUnique({ where: { code: dto.code } });
    if (!pairing) throw new BadRequestException('Mã không đúng');
    if (pairing.revokedAt) throw new BadRequestException('Mã đã bị thu hồi');
    if (pairing.usedAt) throw new BadRequestException('Mã đã được dùng');
    if (pairing.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Mã hết hạn — xin chủ xưởng cấp mã mới');
    }

    const updated = await this.prisma.devicePairing.update({
      where: { id: pairing.id },
      data: {
        usedAt: new Date(),
        lastSeenAt: new Date(),
        deviceLabel: dto.deviceLabel,
        deviceToken: dto.deviceToken,
      },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: updated.userId } });
    const token = this.jwt.sign({ sub: user.id, role: user.role, pairingId: updated.id });
    return { token, user: { id: user.id, name: user.name, role: user.role, groups: user.groups } };
  }

  // "Máy của thợ": chủ xưởng xem ai đang dùng máy nào.
  // `select` tường minh cho `user` (không `include`) — DevicePairing không giới hạn theo vai
  // ở tầng schema, và `User.password` (hash bcrypt của owner) không bao giờ được serialize
  // ra ngoài dưới bất kỳ hình thức nào, kể cả cho chính owner.
  async listDevices() {
    return this.prisma.devicePairing.findMany({
      where: { usedAt: { not: null } },
      include: { user: { select: { id: true, name: true, role: true, line: true, active: true } } },
      orderBy: { usedAt: 'desc' },
    });
  }

  // "Thu hồi máy" — máy đó mất quyền ngay ở request kế tiếp (JwtAuthGuard kiểm revokedAt).
  async revokeDevice(pairingId: string) {
    const pairing = await this.prisma.devicePairing.findUnique({ where: { id: pairingId } });
    if (!pairing) throw new NotFoundException('Không tìm thấy máy này');
    return this.prisma.devicePairing.update({
      where: { id: pairingId },
      data: { revokedAt: new Date() },
    });
  }
}
