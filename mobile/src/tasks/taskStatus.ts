// CAP-TASK-11/12/13 (AC-8/9/10) — nhận / bắt đầu / xong. Một nút lớn theo ĐÚNG trạng thái
// hiện tại (DESIGN-SYSTEM.md §4 C1), dùng chung giữa MyTasksScreen (S6) và TaskDetailScreen
// (S7) để hai màn không lệch nhãn/luật nhau.
import type { Task } from '../api/types';

export type TaskAction = 'ack' | 'start' | 'done';

const ACTION_LABEL: Record<TaskAction, string> = {
  ack: 'Nhận việc',
  start: 'Bắt đầu làm',
  done: 'Báo xong',
};

const NEXT_ACTION: Record<Task['status'], TaskAction | null> = {
  new: 'ack',
  acked: 'start',
  in_progress: 'done',
  done: null,
};

const ACTION_PATH: Record<TaskAction, string> = { ack: 'ack', start: 'start', done: 'done' };

export function nextAction(status: Task['status']): TaskAction | null {
  return NEXT_ACTION[status];
}

export function actionLabel(action: TaskAction): string {
  return ACTION_LABEL[action];
}

export function actionEndpoint(taskId: string, action: TaskAction): string {
  return `/tasks/${taskId}/${ACTION_PATH[action]}`;
}

// §4b luật chữ nghĩa: "Chưa nhận · Đã nhận · Đang làm · Xong" — không lộ tên trạng thái kỹ thuật.
const STATUS_LABEL: Record<Task['status'], string> = {
  new: 'Chưa nhận',
  acked: 'Đã nhận',
  in_progress: 'Đang làm',
  done: 'Xong',
};

export function statusLabel(status: Task['status']): string {
  return STATUS_LABEL[status];
}

// "Quá hạn" (C8) là tông riêng, thay thế chip trạng thái khi việc chưa xong mà đã trễ hẹn —
// không phải một status trong DB, chỉ là cách hiển thị (ARCHITECTURE.md §6 chỉ có 4 status).
export function isOverdue(task: Pick<Task, 'status' | 'dueAt'>): boolean {
  return task.status !== 'done' && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();
}

// "Đã xong hôm nay" (PROTOTYPE.md §1 S6) — việc xong ngày trước thuộc lịch sử (CAP-TASK-15,
// vòng 5), S6 vòng 3 chưa có chỗ cho chúng nên không hiện, không phải xoá hay ẩn lỗi.
export function isDoneToday(task: Task): boolean {
  const doneAt = task.events.find((e) => e.kind === 'done')?.at;
  if (!doneAt) return false;
  return new Date(doneAt).toDateString() === new Date().toDateString();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
