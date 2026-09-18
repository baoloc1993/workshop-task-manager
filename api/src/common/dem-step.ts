import type { TaskStep, WorkerGroup } from '@prisma/client';

// vòng 7 — ARCHITECTURE.md §6 "Task (mở rộng)": "Một step ↔ đúng một nhóm chuyên trách
// (bảng cố định trong code, không phải bảng DB riêng)". Dùng chung bởi orders/ (tạo Task
// đúng nhóm) và tasks/ (lọc hàng đợi theo User.groups) — đặt ở common/ để không module nào
// phải import module kia chỉ để lấy một bảng tra cứu tĩnh.
export const STEP_GROUP: Record<Exclude<TaskStep, 'tinh_cat'>, WorkerGroup> = {
  do: 'do',
  may_vai: 'may',
  cat_mut: 'cat_mut',
  khau_lot: 'khau_lot',
  theu: 'theu',
  goi_tua: 'may', // dùng chung nhóm may (ARCHITECTURE.md §6)
  nhoi: 'nhoi',
};

// Chặng 2 — song song, sinh cùng lúc sau khi "Chốt số cắt" (S24, CAP-DEM-04).
export const CHAPTER_2_BASE_STEPS: Exclude<TaskStep, 'do' | 'tinh_cat' | 'nhoi'>[] = ['may_vai', 'cat_mut', 'khau_lot'];
