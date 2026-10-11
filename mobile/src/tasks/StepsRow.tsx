// "Steps" (kiểu Microsoft To Do): mỗi công đoạn một hàng, vòng
// tròn nhỏ bên trái (xong tô --color-tertiary, đang làm viền --color-primary, kẹt viền
// color-error + chữ đỏ, chờ chỉ viền outline), tên bước, bên phải "ai · khi nào".
// S19 "Công đoạn" trước đây dựng bằng <Button mode="outlined">
// xếp chồng (nút chữ nhật viền), không phải Steps thật — lệch hẳn C12 đã chốt.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { formatTime, isOverdue, isStale } from './taskStatus';

function stepTone(task: Pick<Task, 'status' | 'dueAt' | 'events'>): 'done' | 'inProgress' | 'stuck' | 'waiting' {
  if (task.status === 'done') return 'done';
  if (isOverdue(task) || isStale({ status: task.status, events: (task as Task).events ?? [] })) return 'stuck';
  if (task.status === 'acked' || task.status === 'in_progress') return 'inProgress';
  return 'waiting';
}

export function StepsRow({
  task,
  label,
  onPress,
}: {
  task: Task;
  label: string;
  onPress: () => void;
}) {
  const tone = stepTone(task);
  const who = task.assignees.map((a) => a.user.name).join(', ');
  const doneAt = (task.events ?? []).find((e) => e.kind === 'done')?.at;
  const when = tone === 'done' && doneAt ? formatTime(doneAt) : undefined;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View
        style={[
          styles.dot,
          tone === 'done' && styles.dotDone,
          tone === 'inProgress' && styles.dotInProgress,
          tone === 'stuck' && styles.dotStuck,
        ]}
      />
      <Text style={[styles.label, tone === 'stuck' && styles.labelStuck]} numberOfLines={1}>
        {label}
      </Text>
      {(who || when) && (
        <Text style={styles.meta} numberOfLines={1}>
          {who}
          {who && when ? ' · ' : ''}
          {when}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: tapMin,
    paddingHorizontal: space.xs,
    borderRadius: shape.small,
  },
  pressed: { backgroundColor: colors.surfaceContainerHigh },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.outline,
  },
  dotDone: { borderColor: colors.tertiary, backgroundColor: colors.tertiary },
  dotInProgress: { borderColor: colors.primary },
  dotStuck: { borderColor: colors.error },
  label: { flex: 1, fontSize: fontSize.body, color: colors.onSurface },
  labelStuck: { color: colors.error, fontWeight: '700' },
  meta: { fontSize: fontSize.label, color: colors.onSurfaceVariant, maxWidth: 140 },
});
