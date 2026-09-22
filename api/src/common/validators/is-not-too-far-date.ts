import { registerDecorator, ValidationOptions } from 'class-validator';

// dogfood vòng 9: `POST /tasks/self` nhận hạn năm 9999. Việc trong xưởng
// không có hạn quá 2 năm — xa hơn chỉ có thể là gõ nhầm. Ngày không đọc được thì để
// @IsDateString báo, hàm này bỏ qua.
export function IsNotTooFarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotTooFarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string) {
          if (!value) return true;
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) return true;
          const limit = new Date();
          limit.setFullYear(limit.getFullYear() + 2);
          return d <= limit;
        },
        defaultMessage() {
          return 'dueAt xa quá — tối đa 2 năm tới';
        },
      },
    });
  };
}
