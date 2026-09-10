import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Đánh dấu route không cần token — chỉ /auth/login và /auth/pairings/redeem
// (ARCHITECTURE.md §7 luồng C: người mới quét mã trước khi có phiên).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
