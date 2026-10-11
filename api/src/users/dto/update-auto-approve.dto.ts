import { IsBoolean } from 'class-validator';

// công tắc "Tự duyệt việc tự ghi", hiệu lực ngay cho
// việc tự ghi TỪ LÚC ĐÓ trở đi — không duyệt lại việc đang chờ.
export class UpdateAutoApproveDto {
  @IsBoolean()
  autoApprove: boolean;
}
