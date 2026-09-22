import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsNotPastDate } from '../../common/validators/is-not-past-date.js';

// vòng 9 — CAP-TASK-16 (AC-40, S30 "Ghi việc tôi làm"): nội dung + hạn tuỳ chọn. Không có
// `line` — mảng lấy theo User.line, người nhận luôn là chính người gọi.
export class CreateSelfTaskDto {
  // Cùng khuôn CreateTaskDto: trim trước để "    " không lọt qua MinLength(1).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  content: string;

  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  dueAt?: string;

  // PRD AC-40: "Thợ không tự ghi việc cho người khác (API 403)". Khai field này chỉ để
  // service trả đúng 403 (ranh giới VAI, PERSONAS.md §2) thay vì 400 "property should not
  // exist" của ValidationPipe forbidNonWhitelisted — id nào khác người gọi đều bị chặn,
  // app không bao giờ cần gửi field này.
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];
}
