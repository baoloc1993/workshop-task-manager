import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryMethod, OrderDifficulty, OrderMode } from '@prisma/client';
import { CustomerInputDto } from '../../customers/dto/customer-input.dto.js';
import { PillowDto } from './pillow.dto.js';
import { IsNotPastDate } from '../../common/validators/is-not-past-date.js';

// S18 "Ghi đơn mới" (CAP-DEM-01, AC-18) — một request cho cả "chọn khách cũ" (customerId)
// lẫn "tạo khách mới" (customer); service kiểm đúng-một-trong-hai (không cả hai, không thiếu).
export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerInputDto)
  customer?: CustomerInputDto;

  @IsEnum(OrderMode)
  mode: OrderMode;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description: string;

  @IsOptional()
  @IsEnum(OrderDifficulty)
  difficulty?: OrderDifficulty;

  // review pha P vòng 7: mảng ảnh không giới hạn số phần tử/độ dài từng
  // phần tử — vector DoS bộ nhớ/băng thông. 6 ảnh (vừa đủ cho một bộ ghế nhiều góc chụp),
  // mỗi ảnh base64 tối đa ~1.5MB nén, khớp trần `json({limit:'8mb'})` ở main.ts.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(2_000_000, { each: true })
  photos?: string[];

  @IsOptional()
  @IsBoolean()
  hasEmbroidery?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PillowDto)
  pillows?: PillowDto[];

  // Bỏ trống — server tự điền theo `mode` (DECISIONS.md vòng 7: buôn +2 ngày, lẻ +7 ngày),
  // vẫn sửa được ngay trên S18 trước khi "Ghi đơn" (đúng §4c "không hỏi thứ đoán được").
  // AC-33 (vòng 8) — cùng ràng buộc "không được ở quá khứ" đã có cho CreateTaskDto từ vòng
  // 2, POST /orders trước đó chưa từng có, cùng một lỗi gõ nhầm hạn.
  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  dueAt?: string;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  deposit?: number;

  // AC-19 — S21 "Dùng lại số đo này cho đơn mới" (khách đặt lại): chép SANG đơn mới rồi
  // sửa, không sửa trực tiếp bản ghi cũ (ARCHITECTURE.md §6). Tuỳ chọn — đơn khách mới
  // luôn bỏ trống, người đo điền sau qua PATCH /orders/:id/measurements (S20).
  // AC-33 (vòng 8) — `@Max(500)` đã có ở `UpdateMeasurementsDto` (vòng 7 pha P, dogfood
  // kiểm thử) nhưng bị bỏ sót ở đây — cùng field, cùng đơn vị (cm), cùng lỗ hổng
  // "số đo phi thực tế" nếu client gửi kèm lúc "dùng lại số đo" ở S21.
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
  measurementPhoto?: string;
}
