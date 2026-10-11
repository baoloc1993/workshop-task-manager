// Kiểu dữ liệu của CT-1 — khớp response của task-manager-api.

export type Role = 'owner' | 'worker' | 'bat_coordinator';

// nhóm chuyên trách mảng đệm. Rỗng = chưa được phân nhóm.
export type WorkerGroup = 'do' | 'may' | 'cat_mut' | 'khau_lot' | 'nhoi' | 'theu';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  groups: WorkerGroup[];
  // optional: API chỉ trả nếu có; S6 dùng để ẩn "Ghi việc tôi làm" với thợ đệm.
  line?: WorkerListItem['line'];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface WorkerListItem {
  id: string;
  name: string;
  role: Role;
  // 'dem' — thợ mảng đệm; type cắt mất giá trị này dù DB có.
  line: 'may_va' | 'bat' | 'dem' | null;
  groups?: WorkerGroup[];
  // chỉ có mặt khi gọi `GET /users?paired=all`.
  paired?: boolean;
  // cờ "Tự duyệt việc tự ghi" (), chỉ có
  // nghĩa với worker/bat_coordinator. Optional: API cũ chưa trả thì coi như tắt.
  autoApprove?: boolean;
}

// GET /users/bat-workers: "danh sách thợ bạt (ai đang cầm
// mấy việc)" là thông tin bắt buộc của màn này.
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
  // (S7 "Việc này đã đi qua" phải hiện dòng "chia" cho việc mảng bạt) — API đã trả
  // sẵn field này qua TASK_INCLUDE (task-manager-api/src/tasks/tasks.service.ts), nhưng
  // type ở đây từng cắt mất nên TaskDetailScreen không render được.
  assignedAt: string;
}

// mốc thời gian ngầm, task-manager-api trả sẵn theo đúng thứ tự xảy ra.
export interface TaskEvent {
  id: string;
  kind: 'acked' | 'started' | 'done';
  at: string;
  userId: string;
}

// bảng cố định step ↔ nhóm, dùng ở client để gom S22.
export type TaskStep = 'do' | 'tinh_cat' | 'may_vai' | 'cat_mut' | 'khau_lot' | 'theu' | 'goi_tua' | 'nhoi';

export type Pillow =
  | { type: 'square'; size: 'to' | 'vua' | 'nho'; count: number }
  | { type: 'back'; length: number; width: number; count: number };

// Thông tin Order gắn kèm Task (`TASK_INCLUDE.order`, tasks.service.ts) — CỐ Ý không có
// price/deposit (#9 "vai worker không bao giờ thấy tiền").
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

// `pending`/`rejected` chỉ có khi `source='self'` (thợ tự ghi).
export type TaskApproval = 'approved' | 'pending' | 'rejected';

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
  // optional để đọc được response API cũ (thiếu = việc chủ giao, đã duyệt).
  source?: 'voice' | 'manual' | 'self';
  approval?: TaskApproval;
  // chỉ có ý nghĩa khi line='dem'.
  orderId?: string | null;
  step?: TaskStep | null;
  order?: TaskOrderInfo | null;
}

// Customer KHÔNG phải User (không tài khoản, không persona).
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

// GET /orders (owner). KHÔNG có price/deposit (chỉ OrderDetail mới có).
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

// GET /orders/:id (owner-only). Duy nhất nơi có price/deposit.
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
