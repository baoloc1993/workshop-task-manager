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
  createdAt: string;
}
