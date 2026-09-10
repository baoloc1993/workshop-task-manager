import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTaskDto {
  // dogfood pha I: "    " (toàn khoảng trắng) lọt qua MinLength(1)
  // vì đếm ký tự thô, tạo việc rỗng nội dung — trim trước khi validate độ dài.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  // Vòng 1 chỉ giao đích danh (CAP-TASK-04) — luôn phải có ít nhất một người nhận.
  // Hàng đợi nhóm bạt (giao không cần assignee ngay) là CAP-TASK-06, vòng 4.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  assigneeIds: string[];
}
