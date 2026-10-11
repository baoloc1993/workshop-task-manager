import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Line } from '@prisma/client';
import { IsNotPastDate } from '../../common/validators/is-not-past-date.js';
import { HasNoNul } from '../../common/validators/has-no-nul.js';

// dueAt quá khứ không bị cấm rõ, nhưng chủ xưởng
// tạo việc mới với hạn đã qua chỉ có thể là gõ nhầm — chặn sớm rẻ hơn để lọt rồi phát hiện
// muộn. Ngày hôm nay vẫn hợp lệ (giao trong ngày là bình thường).
// hàm chuyển ra src/common/validators/, dùng chung với CreateOrderDto.

export class CreateTaskDto {
  // " " (toàn khoảng trắng) lọt qua MinLength(1)
  // vì đếm ký tự thô, tạo việc rỗng nội dung — trim trước khi validate độ dài.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  // ký tự NUL → Postgres từ chối → 500. Chặn thành 400.
  @HasNoNul({ message: 'Nội dung việc có ký tự lạ' })
  content: string;

  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  dueAt?: string;

  // bỏ trống nghĩa là 'may_va' (tương thích ngược với
  // client cũ không gửi field này).
  @IsOptional()
  @IsEnum(Line)
  line?: Line;

  // chỉ có ý nghĩa khi line='bat'; service bỏ qua nếu line='may_va'
  // ("measurements chỉ dùng cho line = bat").
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  measurements?: string;

  // giao đích danh — bắt buộc ≥1 người, kiểm ở service vì đó là luật
  // theo TỪNG mảng (line), không phải luật của riêng field này. Việc mảng bạt
  // luôn tạo KHÔNG có assignee — nằm ở "Việc bạt chờ chia" tới khi được giao qua
  // POST /tasks/:id/assign, nên assigneeIds gửi kèm (nếu có) bị bỏ qua ở service.
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];
}
