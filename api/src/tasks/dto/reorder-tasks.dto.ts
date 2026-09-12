import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

// CAP-TASK-07 (AC-14) — S4 "Việc nào làm trước": gửi NGUYÊN danh sách task_id theo thứ tự
// mới mỗi lần kéo-thả xong, server gán lại priority tuần tự theo vị trí (DECISIONS.md vòng 5,
// không nhận "đổi chỗ từng cặp" — tránh lệch thứ tự khi hai request chồng nhau).
export class ReorderTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  taskIds: string[];
}
