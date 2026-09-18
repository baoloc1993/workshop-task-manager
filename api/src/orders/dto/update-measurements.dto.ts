import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateNested } from 'class-validator';
import { PillowDto } from './pillow.dto.js';

// S20 "Số đo" (CAP-DEM-02, AC-19) — mọi field tuỳ chọn: "chụp tờ giấy đo là đủ, ô số
// điền sau cũng được" (PROTOTYPE.md §1 S20 rỗng). Validate "bắt buộc ảnh nếu bộ khó" nằm
// ở lúc báo XONG (TasksService.advance, step='do'), không ở đây — lưu nháp phải luôn được.
export class UpdateMeasurementsDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  measurementLength?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  measurementDepth?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  measurementWidth?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  measurementThickness?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5_000_000) // data-URI base64 — ảnh đã nén phía client trước khi gửi
  measurementPhoto?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PillowDto)
  pillows?: PillowDto[];
}
