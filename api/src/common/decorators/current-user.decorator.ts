import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role, WorkerGroup } from '@prisma/client';

export interface AuthUser {
  userId: string;
  role: Role;
  pairingId?: string;
  // đọc tươi mỗi request ở JwtAuthGuard (không nằm trong JWT payload), vì
  // "Phân vai thợ" đổi có hiệu lực ngay.
  groups: WorkerGroup[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
