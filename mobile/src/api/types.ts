// Kiểu dữ liệu của CT-1 (context/ARCHITECTURE.md §5) — khớp response của task-manager-api.

export type Role = 'owner' | 'worker' | 'bat_coordinator';

// vòng 7 — nhóm chuyên trách mảng đệm (ARCHITECTURE.md §6). Rỗng = chưa được phân nhóm.
export type WorkerGroup = 'do' | 'may' | 'cat_mut' | 'khau_lot' | 'nhoi' | 'theu';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  groups: WorkerGroup[];
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
  groups?: WorkerGroup[];
  // AC-32 (vòng 8) — chỉ có mặt khi gọi `GET /users?paired=all` (S5).
  paired?: boolean;
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

// vòng 7 — bảng cố định step ↔ nhóm (ARCHITECTURE.md §6), dùng ở client để gom S22.
export type TaskStep = 'do' | 'tinh_cat' | 'may_vai' | 'cat_mut' | 'khau_lot' | 'theu' | 'goi_tua' | 'nhoi';

export type Pillow =
  | { type: 'square'; size: 'to' | 'vua' | 'nho'; count: number }
  | { type: 'back'; length: number; width: number; count: number };

// Thông tin Order gắn kèm Task (`TASK_INCLUDE.order`, tasks.service.ts) — CỐ Ý không có
// price/deposit (DESIGN-SYSTEM.md §4d #9 "vai worker không bao giờ thấy tiền").
export interface TaskOrderInfo {
  id: string;
  mode: 'buon' | 'le';
  description: string;
  difficulty: 'de' | 'kho';
  dueAt: string;
  status: 'moi' | 'dang_lam' | 'cho_tra' | 'da_tra';
  measurementLength: number | null;
  measurementDepth: number | null;
  measurementWidth: number | null;
  measurementThickness: number | null;
  measurementPhoto: string | null;
  hasEmbroidery: boolean;
  pillows: Pillow[] | null;
  deliveryMethod: 'xe_om' | 'route' | 'self_pickup';
  customer: { id: string; name: string; phone: string; address: string };
  route: { id: string; name: string } | null;
}

export interface Task {
  id: string;
  content: string;
  line: 'may_va' | 'bat' | 'dem';
  measurements: string | null;
  dueAt: string | null;
  priority: number;
  status: 'new' | 'acked' | 'in_progress' | 'done';
  assignees: TaskAssignee[];
  events: TaskEvent[];
  createdAt: string;
  // vòng 7 — chỉ có ý nghĩa khi line='dem'.
  orderId?: string | null;
  step?: TaskStep | null;
  order?: TaskOrderInfo | null;
}

// vòng 7 — Customer KHÔNG phải User (ARCHITECTURE.md §6: không tài khoản, không persona).
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  areaId: string | null;
  area: { id: string; name: string } | null;
  note: string | null;
  orders: OrderSummary[];
}

export interface OrderSummary {
  id: string;
  description: string;
  mode: 'buon' | 'le';
  dueAt: string;
  status: 'moi' | 'dang_lam' | 'cho_tra' | 'da_tra';
  measurementLength: number | null;
  measurementDepth: number | null;
  measurementWidth: number | null;
  measurementThickness: number | null;
  measurementPhoto: string | null;
  pillows: Pillow[] | null;
  createdAt: string;
}

export interface Route {
  id: string;
  name: string;
  landmarks: string[];
  active: boolean;
}

// S17 — GET /orders (owner). KHÔNG có price/deposit (chỉ OrderDetail mới có).
export interface OrderListItem {
  id: string;
  mode: 'buon' | 'le';
  description: string;
  difficulty: 'de' | 'kho';
  dueAt: string;
  status: 'moi' | 'dang_lam' | 'cho_tra' | 'da_tra';
  hasEmbroidery: boolean;
  deliveryMethod: 'xe_om' | 'route' | 'self_pickup';
  customer: { id: string; name: string; phone: string };
  route: { id: string; name: string } | null;
  tasks: { id: string; step: TaskStep | null; status: Task['status'] }[];
  createdAt: string;
}

// S19 — GET /orders/:id (owner-only). Duy nhất nơi có price/deposit.
export interface OrderDetail extends Omit<OrderListItem, 'tasks'> {
  customer: Customer;
  route: Route | null;
  measurementLength: number | null;
  measurementDepth: number | null;
  measurementWidth: number | null;
  measurementThickness: number | null;
  measurementPhoto: string | null;
  photos: string[];
  pillows: Pillow[] | null;
  price: number;
  deposit: number;
  fabricMeters: number | null;
  foamSheets: number | null;
  tasks: (Task & { order?: never })[];
}
