import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsNotPastDate } from '../../common/validators/is-not-past-date.js';
import { HasNoNul } from '../../common/validators/has-no-nul.js';
import { IsNotTooFarDate } from '../../common/validators/is-not-too-far-date.js';

// vòng 9 — CAP-TASK-16 (AC-40, S30 "Ghi việc tôi làm"): nội dung + hạn tuỳ chọn. Không có
// `line` — mảng lấy theo User.line, người nhận luôn là chính người gọi.
export class CreateSelfTaskDto {
  // Cùng khuôn CreateTaskDto: trim trước để "    " không lọt qua MinLength(1).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Nội dung việc phải là chữ' })
  @MinLength(1, { message: 'Ghi vài chữ việc bạn đang làm' })
  @MaxLength(200, { message: 'Nội dung việc dài quá — tối đa 200 ký tự' })
  // dogfood vòng 9 (breaker): ký tự NUL làm Postgres từ chối cột text → 500. Chặn ở đây thành 400.
  @HasNoNul({ message: 'Nội dung việc có ký tự lạ' })
  content: string;

  // dogfood vòng 9 (breaker): sai định dạng thì chỉ báo lỗi định dạng (không kèm "quá khứ"),
  // và có trần 2 năm — năm 9999 chỉ có thể là gõ nhầm.
  @IsOptional()
  @IsDateString({}, { message: 'Hạn không đúng dạng ngày' })
  @IsNotPastDate({ message: 'Hạn không được là ngày đã qua' })
  @IsNotTooFarDate({ message: 'Hạn xa quá — tối đa 2 năm tới' })
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
