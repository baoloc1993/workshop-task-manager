import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

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

  // Vòng 1 chỉ giao đích danh (CAP-TASK-04) — luôn phải có ít nhất một người nhận.
  // Hàng đợi nhóm bạt (giao không cần assignee ngay) là CAP-TASK-06, vòng 4.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  assigneeIds: string[];
}
