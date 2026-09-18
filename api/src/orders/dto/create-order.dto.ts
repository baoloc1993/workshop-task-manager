import { Transform, Type } from 'class-transformer';
import {
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
  @IsOptional()
  @IsDateString()
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
  measurementPhoto?: string;
}
