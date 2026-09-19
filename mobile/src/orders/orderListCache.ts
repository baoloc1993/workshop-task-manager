// AC-29 (vòng 8, picky 2026-09-19) — danh sách S17 của LẦN TẢI THÀNH CÔNG gần nhất, giữ ở
// cấp module (sống qua unmount/mount màn) để vào màn khi mất mạng vẫn thấy danh sách cũ
// thay vì màn trống + banner hứa "lần cập nhật gần nhất". Chỉ trong RAM: kill app = mất
// (đủ cho ca "ra khỏi màn rồi vào lại"); xoá khi đăng xuất để không lộ đơn sang người khác.
import type { OrderListItem } from '../api/types';

let cached: OrderListItem[] | null = null;

export const getOrderListCache = () => cached;
export const setOrderListCache = (orders: OrderListItem[]) => {
  cached = orders;
};
export const clearOrderListCache = () => {
  cached = null;
};
