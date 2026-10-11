// nhận / bắt đầu / xong. Một nút lớn theo ĐÚNG trạng thái
// hiện tại, dùng chung giữa MyTasksScreen và TaskDetailScreen
// để hai màn không lệch nhãn/luật nhau.
import type { Task } from '../api/types';
import { colors } from '../theme/tokens';

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

// dòng phụ trạng thái không còn nền chip, chỉ chữ tô màu: đang
// làm tô primary, xong tô tertiary, quá hạn tô error đậm, còn lại tô on-surface-variant.
export function statusColor(task: Pick<Task, 'status' | 'dueAt'>): string {
  if (isOverdue(task)) return colors.error;
  if (task.status === 'in_progress') return colors.primary;
  if (task.status === 'done') return colors.tertiary;
  return colors.onSurfaceVariant;
}

// "Quá hạn" là tông riêng, thay thế chip trạng thái khi việc chưa xong mà đã trễ hẹn —
// không phải một status trong DB, chỉ là cách hiển thị (chỉ có 4 status).
export function isOverdue(task: Pick<Task, 'status' | 'dueAt'>): boolean {
  return task.status !== 'done' && !!task.dueAt && new Date(task.dueAt).getTime() < Date.now();
}

// "Đã xong hôm nay" — việc xong ngày trước thuộc lịch sử.
// Màn này chưa có chỗ cho chúng nên không hiện, không phải xoá hay ẩn lỗi.
export function isDoneToday(task: Task): boolean {
  const doneAt = task.events.find((e) => e.kind === 'done')?.at;
  if (!doneAt) return false;
  return new Date(doneAt).toDateString() === new Date().toDateString();
}

const STALE_HOURS = 24;

// "Đứng yên": việc `acked`/`in_progress` mà ≥24 giờ
// không có TaskEvent mới nào ghi thêm kể từ mốc gần nhất. Việc `new` (chưa ai nhận) không
// tính "đứng yên" — nó thuộc nhóm "chưa ai nhận" riêng, dù chờ bao lâu.
export function isStale(task: Pick<Task, 'status' | 'events'>): boolean {
  if (task.status !== 'acked' && task.status !== 'in_progress') return false;
  const lastEventAt = task.events.reduce<number>(
    (max, e) => Math.max(max, new Date(e.at).getTime()),
    0,
  );
  if (lastEventAt === 0) return false;
  return Date.now() - lastEventAt >= STALE_HOURS * 60 * 60 * 1000;
}

export type TaskBucket = 'overdueOrStale' | 'inProgress' | 'unassigned';

// bốn nhóm của ba nhóm đầu cho việc chưa
// xong (nhóm thứ tư "đã xong hôm nay" dùng isDoneToday() sẵn có, tách riêng ở màn hình).
// Thuần tính từ dữ liệu Task/TaskEvent đã có ("thuần trình bày").
export function taskBucket(task: Task): TaskBucket {
  if (isOverdue(task) || isStale(task)) return 'overdueOrStale';
  if (task.status === 'new') return 'unassigned';
  return 'inProgress';
}

// §4b luật chữ nghĩa — S1/S16 hiện mảng của việc bằng chữ, không lộ tên trường kỹ thuật.
const LINE_LABEL: Record<Task['line'], string> = { may_va: 'May vá', bat: 'Bạt', dem: 'Đệm ghế' };

export function lineLabel(line: Task['line']): string {
  return LINE_LABEL[line];
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
