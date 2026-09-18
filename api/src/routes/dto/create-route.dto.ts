import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

// S25 "Khu vực trả hàng" (CAP-DEM-05, AC-23) — chủ xưởng cấu hình 4-7 khu vực.
export class CreateRouteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
