// Kiểu dữ liệu của CT-1 (context/ARCHITECTURE.md §5) — khớp response của task-manager-api.

export type Role = 'owner' | 'worker' | 'bat_coordinator';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface WorkerListItem {
  id: string;
  name: string;
  role: Role;
  line: 'may_va' | 'bat' | null;
}

// S10 (CAP-TASK-06, vòng 4) — GET /users/bat-workers: "danh sách thợ bạt (ai đang cầm
// mấy việc)" là thông tin bắt buộc của màn này (PROTOTYPE.md §1 S10).
export interface BatWorkerItem extends WorkerListItem {
  activeTaskCount: number;
}

export interface CreatePairingResponse {
  pairingId: string;
  code: string;
  expiresAt: string;
  userName: string;
}

export interface DevicePairing {
  id: string;
  code: string;
  expiresAt: string;
  usedAt: string | null;
  deviceLabel: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  user: WorkerListItem;
}

export interface TaskAssignee {
  userId: string;
  user: WorkerListItem;
  // AC-11 (S7 "Việc này đã đi qua" phải hiện dòng "chia" cho việc mảng bạt) — API đã trả
  // sẵn field này qua TASK_INCLUDE (task-manager-api/src/tasks/tasks.service.ts), nhưng
  // type ở đây từng cắt mất nên TaskDetailScreen không render được (review pha P vòng 6).
  assignedAt: string;
}

// CAP-TASK-09 — mốc thời gian ngầm, task-manager-api trả sẵn theo đúng thứ tự xảy ra.
export interface TaskEvent {
  id: string;
  kind: 'acked' | 'started' | 'done';
  at: string;
  userId: string;
}

export interface Task {
  id: string;
  content: string;
  line: 'may_va' | 'bat';
  measurements: string | null;
  dueAt: string | null;
  priority: number;
  status: 'new' | 'acked' | 'in_progress' | 'done';
  assignees: TaskAssignee[];
  events: TaskEvent[];
  createdAt: string;
}
