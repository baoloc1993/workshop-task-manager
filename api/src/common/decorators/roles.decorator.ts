import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Ma trận vai × hành động: PERSONAS.md §2. Route không gắn @Roles thì mọi vai
// đã đăng nhập đều gọi được — dùng khi service tự lọc theo assignee (vd GET /tasks/:id).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
