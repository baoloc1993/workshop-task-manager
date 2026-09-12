import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

// CAP-TASK-06 (AC-13) — S10 "Chọn thợ để giao": 1..n thợ bạt cho một việc mảng bạt.
export class AssignTaskDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  userIds: string[];
}
