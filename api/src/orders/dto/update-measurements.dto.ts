import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, ValidateNested } from 'class-validator';
import { PillowDto } from './pillow.dto.js';

// S20 "Số đo" (CAP-DEM-02, AC-19) — mọi field tuỳ chọn: "chụp tờ giấy đo là đủ, ô số
// điền sau cũng được" (PROTOTYPE.md §1 S20 rỗng). Validate "bắt buộc ảnh nếu bộ khó" nằm
// ở lúc báo XONG (TasksService.advance, step='do'), không ở đây — lưu nháp phải luôn được.
// dogfood pha I vòng 7: không có trần cho số đo — lưu được số phi
// thực tế (999999999999cm). Trần 500cm rộng rãi cho mọi bộ ghế sofa/salon thật.
export class UpdateMeasurementsDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  measurementLength?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  measurementDepth?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
  measurementWidth?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(500)
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
