import { IsIn, IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';

// gối vuông (cỡ có sẵn, KHÔNG tách Task) hoặc gối tựa (số đo riêng, tự sinh
// Task "may/nhồi gối tựa" ở chặng 2). Lưu trong Order.pillows (Json).
export class PillowDto {
  @IsIn(['square', 'back'])
  type: 'square' | 'back';

  // gối vuông
  @IsOptional()
  @IsIn(['to', 'vua', 'nho'])
  size?: 'to' | 'vua' | 'nho';

  // gối tựa
  @IsOptional()
  @IsNumber()
  @IsPositive()
  length?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @IsInt()
  @IsPositive()
  count: number;
}
