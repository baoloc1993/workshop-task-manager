import { IsArray, IsEnum } from 'class-validator';
import { WorkerGroup } from '@prisma/client';

// S26 "Phân vai thợ" (CAP-DEM-07, AC-21) — chạm chip bật/tắt (C18), hiệu lực ngay: gửi
// nguyên MẢNG MỚI mỗi lần (thay toàn bộ), không phải thêm/bớt từng phần tử.
export class UpdateGroupsDto {
  @IsArray()
  @IsEnum(WorkerGroup, { each: true })
  groups: WorkerGroup[];
}
