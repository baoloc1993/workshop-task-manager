import type { WorkerListItem } from '../api/types';
// người nhận việc may vá: thợ mảng may vá + mọi điều phối (bat_coordinator
// được giao việc ở mọi mảng trừ đệm). Dùng chung với
// VoiceCaptureScreen để tập khớp tên = tập hiện ở danh sách.
export function isMayVaAssignee(w: WorkerListItem): boolean {
  return (w.role === 'worker' && w.line === 'may_va') || w.role === 'bat_coordinator';
}
