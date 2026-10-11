import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// chạm chip địa danh bật/tắt có hiệu lực ngay, không nút "Lưu" riêng
// (cùng nguyên tắc "hiệu lực ngay" đã chốt cho S26 Phân vai).
export class UpdateRouteDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  landmarks?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
