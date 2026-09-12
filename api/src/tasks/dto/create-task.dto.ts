import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Line } from '@prisma/client';

// dogfood pha I: dueAt quá khứ không bị PRD cấm rõ, nhưng chủ xưởng
// tạo việc mới với hạn đã qua chỉ có thể là gõ nhầm — chặn sớm rẻ hơn để lọt rồi phát hiện
// muộn (DECISIONS.md, vòng 2). Ngày hôm nay vẫn hợp lệ (giao trong ngày là bình thường).
function IsNotPastDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotPastDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          if (!value) return true;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return new Date(value) >= today;
        },
        defaultMessage() {
          return 'dueAt không được là ngày trong quá khứ';
        },
      },
    });
  };
}

export class CreateTaskDto {
  // dogfood pha I: "    " (toàn khoảng trắng) lọt qua MinLength(1)
  // vì đếm ký tự thô, tạo việc rỗng nội dung — trim trước khi validate độ dài.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content: string;

  @IsOptional()
  @IsDateString()
  @IsNotPastDate()
  dueAt?: string;

  // CAP-TASK-06 (vòng 4) — bỏ trống nghĩa là 'may_va' (tương thích ngược với vòng 1-3,
  // client cũ không gửi field này).
  @IsOptional()
  @IsEnum(Line)
  line?: Line;

  // CAP-TASK-05 (vòng 4) — chỉ có ý nghĩa khi line='bat'; service bỏ qua nếu line='may_va'
  // (ARCHITECTURE.md §6: "measurements chỉ dùng cho line = bat").
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  measurements?: string;

  // Vòng 1: giao đích danh (CAP-TASK-04) — bắt buộc ≥1 người, kiểm ở service vì đó là luật
  // theo TỪNG mảng (line), không phải luật của riêng field này. Việc mảng bạt (CAP-TASK-06,
  // vòng 4) luôn tạo KHÔNG có assignee — nằm ở "Việc bạt chờ chia" tới khi được giao qua
  // POST /tasks/:id/assign, nên assigneeIds gửi kèm (nếu có) bị bỏ qua ở service.
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  assigneeIds?: string[];
}
