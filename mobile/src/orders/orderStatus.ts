// vòng 7 — hàm thuần cho mảng đệm ghế, cùng khuôn taskBucket()/isStale() ở
// tasks/taskStatus.ts (DECISIONS.md vòng 5: "không phải luật phân quyền, chỉ là cách
// trình bày" — gom nhóm/tính toán ở CLIENT, server chỉ trả dữ liệu thô).
import type { OrderDetail, OrderListItem, Pillow, Route, TaskStep, WorkerGroup } from '../api/types';

export const STEP_LABEL: Record<TaskStep, string> = {
  do: 'Đi đo',
  tinh_cat: 'Tính cắt vải, mút',
  may_vai: 'May vải',
  cat_mut: 'Cắt mút',
  khau_lot: 'Khâu vải lót',
  theu: 'Thêu hình',
  goi_tua: 'May/nhồi gối tựa',
  nhoi: 'Nhồi mút vào vỏ',
};

export const GROUP_LABEL: Record<WorkerGroup, string> = {
  do: 'Nhóm đo',
  may: 'Nhóm may',
  cat_mut: 'Nhóm cắt mút',
  khau_lot: 'Nhóm khâu lót',
  theu: 'Nhóm thêu',
  nhoi: 'Nhóm nhồi',
};

// ARCHITECTURE.md §6 — bảng cố định step ↔ nhóm, bản sao ở client (DECISIONS.md vòng 7:
// server đã có src/common/dem-step.ts; client cần bản riêng để gom S22 không round-trip).
export const STEP_GROUP: Partial<Record<TaskStep, WorkerGroup>> = {
  do: 'do',
  may_vai: 'may',
  cat_mut: 'cat_mut',
  khau_lot: 'khau_lot',
  theu: 'theu',
  goi_tua: 'may',
  nhoi: 'nhoi',
};

const CHAPTER_2_STEPS: TaskStep[] = ['may_vai', 'cat_mut', 'khau_lot', 'theu', 'goi_tua'];

// C16 "Tiến độ chặng" — chỉ là chữ, không vạch (DESIGN-SYSTEM.md §4). Trả về dòng phụ +
// có "kẹt" hay không (viền/chữ đỏ).
export function orderProgress(order: Pick<OrderListItem, 'status' | 'tasks'>): { text: string; stuck: boolean } {
  const tasks = order.tasks;
  const doTask = tasks.find((t) => t.step === 'do');
  if (order.status === 'da_tra') return { text: 'Đã trả hàng', stuck: false };
  if (order.status === 'cho_tra') return { text: 'Chặng 3/3 · chờ trả hàng', stuck: false };
  if (!doTask || doTask.status !== 'done') {
    return { text: doTask?.status === 'new' ? 'Chặng 1/3 · chưa ai đi đo' : 'Chặng 1/3 · đang đo', stuck: false };
  }
  const ch2 = tasks.filter((t) => t.step && CHAPTER_2_STEPS.includes(t.step));
  if (ch2.length === 0) return { text: 'Chặng 1/3 · chờ chốt số cắt', stuck: false };
  const done = ch2.filter((t) => t.status === 'done').length;
  const unassigned = ch2.some((t) => t.status === 'new');
  if (done === ch2.length) return { text: 'Chặng 3/3 · đang nhồi', stuck: false };
  return { text: `Chặng 2/3 · ${done}/${ch2.length} công đoạn xong`, stuck: unassigned };
}

export function modeLabel(mode: 'buon' | 'le'): string | null {
  return mode === 'buon' ? 'BUÔN' : null; // lẻ: không nhãn (DESIGN-SYSTEM.md §4 C17)
}

export function pillowSummary(pillows: Pillow[] | null | undefined): string | null {
  if (!pillows || pillows.length === 0) return null;
  const squares = pillows.filter((p) => p.type === 'square').reduce((n, p) => n + p.count, 0);
  const backs = pillows.filter((p) => p.type === 'back').reduce((n, p) => n + p.count, 0);
  const parts: string[] = [];
  if (squares > 0) parts.push(`${squares} gối vuông`);
  if (backs > 0) parts.push(`${backs} gối tựa`);
  return parts.join(', ') || null;
}

export function hasBackPillow(pillows: Pillow[] | null | undefined): boolean {
  return !!pillows?.some((p) => p.type === 'back');
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

export function formatMeasurements(order: {
  measurementLength: number | null;
  measurementDepth: number | null;
  measurementWidth: number | null;
  measurementThickness: number | null;
}): string | null {
  const parts: string[] = [];
  if (order.measurementLength) parts.push(`Dài ${order.measurementLength}`);
  if (order.measurementDepth) parts.push(`Sâu ${order.measurementDepth}`);
  if (order.measurementWidth) parts.push(`Ngang ${order.measurementWidth}`);
  if (order.measurementThickness) parts.push(`Dày ${order.measurementThickness}`);
  return parts.length ? parts.join(' · ') : null;
}

// AC-23 (S18) — gợi ý khu vực trả hàng: khớp địa danh trong địa chỉ (chuỗi con, không
// phân biệt hoa/thường/dấu) → khu vực khách trả lần trước → "Xe ôm chuyến lẻ" mặc định.
// Chủ xưởng LUÔN xác nhận/sửa lại trước khi lưu (DECISIONS.md vòng 7).
export function suggestRoute(
  address: string,
  routes: Route[],
  lastRouteId: string | null | undefined,
): { routeId: string | null; label: string } {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const addrNorm = norm(address);
  for (const route of routes.filter((r) => r.active)) {
    if (route.landmarks.some((lm) => lm.trim() && addrNorm.includes(norm(lm)))) {
      return { routeId: route.id, label: route.name };
    }
  }
  if (lastRouteId) {
    const last = routes.find((r) => r.id === lastRouteId && r.active);
    if (last) return { routeId: last.id, label: last.name };
  }
  return { routeId: null, label: 'Xe ôm chuyến lẻ' };
}

export function remaining(order: Pick<OrderDetail, 'price' | 'deposit'>): number {
  return order.price - order.deposit;
}
