import { registerDecorator, ValidationOptions } from 'class-validator';

// dogfood vòng 9: ký tự NUL (\0) trong ô chữ khiến Postgres từ chối cột
// text → 500 chung. Chặn ở tầng validate thành 400 có câu báo.
export function HasNoNul(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'hasNoNul',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value !== 'string' || !value.includes('\0');
        },
        defaultMessage() {
          return 'Nội dung có ký tự lạ';
        },
      },
    });
  };
}
