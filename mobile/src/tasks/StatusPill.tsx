// Chip trạng thái. Nhãn chữ
// `--text-label` đậm, bo 3px, nền theo trạng thái — CHỈ dùng ở S1, S6 (nhãn "Chờ chủ duyệt")
// và S31; riêng nhãn "Chờ chủ duyệt" thêm S7 + S16 (newbie) —
// các màn khác vẫn C8 dòng phụ chữ màu (tasks/TaskRow.tsx, StatusChip.tsx).
// Chỉ dùng token + cặp tương phản đã có ở §2/§3 — không đẻ màu mới.
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { Task } from '../api/types';
import { colors, fontSize } from '../theme/tokens';
import { isOverdue, isStale } from './taskStatus';

export type PillKind = 'new' | 'acked' | 'in_progress' | 'late' | 'stale' | 'pending';

const LABEL: Record<PillKind, string> = {
  new: 'Chưa nhận',
  acked: 'Đã nhận',
  in_progress: 'Đang làm',
  late: 'Quá hạn',
  stale: 'Đứng yên',
  pending: 'Chờ chủ duyệt',
};

const TONE: Record<PillKind, { bg: string; fg: string; border: string }> = {
  // chưa nhận = viền outline, không nền (§4 C22)
  new: { bg: 'transparent', fg: colors.onSurface, border: colors.outline },
  acked: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer, border: colors.secondaryContainer },
  in_progress: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer, border: colors.primaryContainer },
  late: { bg: colors.errorContainer, fg: colors.onErrorContainer, border: colors.errorContainer },
  stale: { bg: colors.errorContainer, fg: colors.onErrorContainer, border: colors.errorContainer },
  // chờ duyệt = cặp mới on-surface / surface-container-high (~12:1)
  pending: { bg: colors.surfaceContainerHigh, fg: colors.onSurface, border: colors.surfaceContainerHigh },
};

/** Trạng thái hiển thị của một việc CHƯA xong (việc xong không có chip C22 — vẫn C8 "Xong").
 * Quá hạn thắng đứng yên thắng trạng thái thường, cùng thứ tự với taskBucket(). */
export function pillKindOf(task: Pick<Task, 'status' | 'dueAt' | 'events'>): PillKind | null {
  if (task.status === 'done') return null;
  if (isOverdue(task)) return 'late';
  if (isStale(task)) return 'stale';
  return task.status;
}

export function StatusPill({ kind }: { kind: PillKind }) {
  const tone = TONE[kind];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{LABEL[kind]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // bo 3px đúng §4 C22 (prototype `.chip.pill` border-radius:3px) — không có token bo 3px,
  // §4 khai thẳng giá trị này cho riêng C22.
  pill: { borderRadius: 3, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  text: { fontSize: fontSize.label, fontWeight: '700' },
});
