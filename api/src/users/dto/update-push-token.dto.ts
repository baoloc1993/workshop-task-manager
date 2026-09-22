import { IsOptional, IsString, MaxLength } from 'class-validator';

// vòng 9 — AC-41: owner gửi Expo push token sau khi đăng nhập; `null`/bỏ trống = xoá
// (lúc đăng xuất) để máy đã đăng xuất không còn nhận "việc chờ duyệt".
export class UpdatePushTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string | null;
}
