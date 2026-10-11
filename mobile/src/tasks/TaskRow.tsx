// Hàng việc, dùng chung S1/S6/S9 — thay cho Card MD3. Nền trắng
// bo --shape-small, vòng tròn trạng thái bên trái, tên việc + dòng phụ ghép bằng " · ", sao
// đỏ bên phải khi quá hạn.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { isOverdue, statusColor, statusLabel } from './taskStatus';

function StatusDot({ task, alert }: { task: Pick<Task, 'status' | 'dueAt'>; alert?: boolean }) {
  const color = alert ? colors.error : statusColor(task);
  const filled = task.status === 'done';
  return <View style={[styles.dot, { borderColor: color }, filled && { backgroundColor: color }]} />;
}

export function TaskRow({
  task,
  title,
  metaParts,
  showStatus = true,
  topLine,
  pill,
  alert,
  onPress,
}: {
  task: Pick<Task, 'status' | 'dueAt'>;
  title: string;
  metaParts?: (string | null | undefined | false)[];
  showStatus?: boolean;
  topLine?: ReactNode;
  /** chip trạng thái đứng ĐẦU dòng phụ; chỉ S1/S6/S31 truyền vào. */
  pill?: ReactNode;
  /** ép khuôn "sắp trễ" của C3 (viền + sao đỏ) cho việc không quá hạn theo
   * `dueAt` nhưng đứng yên ≥24 giờ (nhóm "Quá hạn hoặc đứng yên" của S1). */
  alert?: boolean;
  onPress: () => void;
}) {
  const late = alert || isOverdue(task);
  const done = task.status === 'done';
  const meta = (metaParts ?? []).filter(Boolean).join(' · ');
  const statusText = late ? 'Quá hạn' : statusLabel(task.status);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <StatusDot task={task} alert={late && task.status !== 'done'} />
      <View style={styles.body}>
        {topLine}
        {/* C3 "xong": gạch ngang + chữ --color-on-surface-variant,
            trước đây TaskRow không có nhánh riêng cho trạng thái này. */}
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.subRow}>
          {pill}
          <Text style={[styles.subtitle, styles.subText]} numberOfLines={2}>
            {meta}
            {meta && showStatus ? ' · ' : ''}
            {showStatus && <Text style={{ color: statusColor(task), fontWeight: '700' }}>{statusText}</Text>}
          </Text>
        </View>
      </View>
      {late && <Text style={styles.star}>★</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: tapMin,
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pressed: { backgroundColor: colors.surfaceContainerHigh },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.body, color: colors.onSurface },
  titleDone: { textDecorationLine: 'line-through', color: colors.onSurfaceVariant },
  subtitle: { fontSize: fontSize.label, color: colors.onSurfaceVariant },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: 2 },
  subText: { flexShrink: 1 },
  star: { fontSize: fontSize.title, color: colors.error },
});
