import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Đánh dấu route không cần token — chỉ /auth/login và /auth/pairings/redeem
// (luồng C: người mới quét mã trước khi có phiên).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
