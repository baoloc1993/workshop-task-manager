import type { WorkerListItem } from '../api/types';
// AC-39 (vòng 9) — người nhận việc may vá: thợ mảng may vá + mọi điều phối (bat_coordinator
// được giao việc ở mọi mảng trừ đệm, ARCHITECTURE.md §6 mở rộng vòng 9). Dùng chung với
// VoiceCaptureScreen để tập khớp tên = tập hiện ở danh sách.
export function isMayVaAssignee(w: WorkerListItem): boolean {
  return (w.role === 'worker' && w.line === 'may_va') || w.role === 'bat_coordinator';
}
