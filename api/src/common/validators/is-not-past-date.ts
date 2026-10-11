import { registerDecorator, ValidationOptions } from 'class-validator';

// tách dùng chung cho CreateTaskDto (dueAt việc bạt/may vá) VÀ
// CreateOrderDto (dueAt đơn đệm): đã chặn ca này
// cho Task, nhưng POST /orders chưa từng có cùng ràng buộc — cùng một lỗi gõ nhầm
// hạn giao ở quá khứ, cùng một cách xử lý, tách hàm tránh copy-paste lệch nhau về sau.
export function IsNotPastDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotPastDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          if (!value) return true;
          // ngày không đọc được thì để @IsDateString báo, khỏi kèm
          // thêm câu "quá khứ" sai lý do.
          if (Number.isNaN(new Date(value).getTime())) return true;
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
