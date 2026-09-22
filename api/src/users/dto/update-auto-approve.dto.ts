import { IsBoolean } from 'class-validator';

// vòng 9 — CAP-TASK-16 (AC-41, S26): công tắc "Tự duyệt việc tự ghi", hiệu lực ngay cho
// việc tự ghi TỪ LÚC ĐÓ trở đi — không duyệt lại việc đang chờ (ARCHITECTURE.md §6).
export class UpdateAutoApproveDto {
  @IsBoolean()
  autoApprove: boolean;
}
