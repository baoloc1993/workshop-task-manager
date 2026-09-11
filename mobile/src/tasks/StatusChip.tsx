// C8 — Assist chip trạng thái việc (DESIGN-SYSTEM.md §4), dùng chung S6/S7. Mỗi trạng thái
// một tông riêng; "Quá hạn" thay thế chip trạng thái khi việc chưa xong mà đã trễ hẹn.
import { Chip } from 'react-native-paper';
import type { Task } from '../api/types';
import { colors } from '../theme/tokens';
import { isOverdue, statusLabel } from './taskStatus';

const CHIP_STYLE: Record<'new' | 'acked' | 'in_progress' | 'done' | 'late', { bg: string; fg: string }> = {
  new: { bg: colors.surface, fg: colors.onSurfaceVariant },
  acked: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer },
  in_progress: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer },
  done: { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer },
  late: { bg: colors.errorContainer, fg: colors.onErrorContainer },
};

export function StatusChip({ task }: { task: Pick<Task, 'status' | 'dueAt'> }) {
  const key = isOverdue(task) ? 'late' : task.status;
  const { bg, fg } = CHIP_STYLE[key];
  const label = key === 'late' ? 'Quá hạn' : statusLabel(task.status);
  return (
    <Chip style={{ backgroundColor: bg, alignSelf: 'flex-start' }} textStyle={{ color: fg, fontWeight: '700' }}>
      {label}
    </Chip>
  );
}
