import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateTaskDto {
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
