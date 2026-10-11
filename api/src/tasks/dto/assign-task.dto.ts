import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

// 1..n thợ bạt cho một việc mảng bạt.
export class AssignTaskDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  userIds: string[];
}
