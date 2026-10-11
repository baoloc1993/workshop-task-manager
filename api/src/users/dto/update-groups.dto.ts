import { IsArray, IsEnum } from 'class-validator';
import { WorkerGroup } from '@prisma/client';

// chạm chip bật/tắt, hiệu lực ngay: gửi
// nguyên MẢNG MỚI mỗi lần (thay toàn bộ), không phải thêm/bớt từng phần tử.
export class UpdateGroupsDto {
  @IsArray()
  @IsEnum(WorkerGroup, { each: true })
  groups: WorkerGroup[];
}
