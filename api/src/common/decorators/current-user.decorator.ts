import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role, WorkerGroup } from '@prisma/client';

export interface AuthUser {
  userId: string;
  role: Role;
  pairingId?: string;
  // vòng 7 — đọc tươi mỗi request ở JwtAuthGuard (không nằm trong JWT payload), vì
  // "Phân vai thợ" (S26) đổi có hiệu lực ngay (DECISIONS.md vòng 7).
  groups: WorkerGroup[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
