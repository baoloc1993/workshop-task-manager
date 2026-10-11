// C8 — Dòng phụ trạng thái (DESIGN-SYSTEM.md §4), dùng ở S7 (đứng riêng, không ghép vào
// dòng phụ của hàng việc — xem tasks/TaskRow.tsx cho S1/S6/S9). Không còn nền chip, chỉ chữ
// tô màu theo trạng thái (statusColor()).
import { Text } from 'react-native-paper';
import type { Task } from '../api/types';
import { fontSize } from '../theme/tokens';
import { isOverdue, statusColor, statusLabel } from './taskStatus';

export function StatusChip({ task }: { task: Pick<Task, 'status' | 'dueAt'> }) {
  const label = isOverdue(task) ? 'Quá hạn' : statusLabel(task.status);
  return (
    <Text style={{ color: statusColor(task), fontSize: fontSize.label, fontWeight: '700' }}>
      {label}
    </Text>
  );
}
