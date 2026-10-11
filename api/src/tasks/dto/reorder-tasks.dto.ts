import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

// gửi NGUYÊN danh sách task_id theo thứ tự
// mới mỗi lần kéo-thả xong, server gán lại priority tuần tự theo vị trí.
// Không nhận "đổi chỗ từng cặp" — tránh lệch thứ tự khi hai request chồng nhau.
export class ReorderTasksDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  taskIds: string[];
}
