import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// S18 "Ghi đơn mới" tạo Customer MỚI ngay trong cùng lượt (AC-18) — không có endpoint
// "tạo khách" riêng, cùng khuôn với CreateTaskDto (một request, một hành động của người dùng).
export class CustomerInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  note?: string;
}
