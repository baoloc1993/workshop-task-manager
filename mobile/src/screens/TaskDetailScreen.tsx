import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { StatusChip } from '../tasks/StatusChip';
import { actionEndpoint, actionLabel, formatTime, nextAction } from '../tasks/taskStatus';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';

// S7 — chi tiết việc. CAP-TASK-11/12/13 (AC-8/9/10): một nút lớn theo đúng trạng thái hiện
// tại. CAP-TASK-09 (AC-11): khối "Việc này đã đi qua" hiện mốc thời gian ngầm, tự ghi.
export function TaskDetailScreen({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Task>(`/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setError(false);
      })
      .catch(() => setError(true));
  }, [taskId]);

  useFocusEffect(load);

  async function handleAction() {
    if (!task) return;
    const action = nextAction(task.status);
    if (!action || submitting) return; // đang gửi — khoá, chống bấm hai lần (ARCHITECTURE.md §6)
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await api.patch<Task>(actionEndpoint(task.id, action));
      if (user) track(`viec_${action}`, user.id, { taskId: task.id });
      setTask(updated);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Banner visible icon="alert-circle" style={styles.banner}>
          Không tải được việc này.
        </Banner>
      </View>
    );
  }

  if (!task) return <View style={styles.container} />;

  const action = nextAction(task.status);
  const ackAt = task.events.find((e) => e.kind === 'acked')?.at;
  const startAt = task.events.find((e) => e.kind === 'started')?.at;
  const doneAt = task.events.find((e) => e.kind === 'done')?.at;
  // AC-11 — việc mảng bạt đi qua thêm bước "chia" (điều phối giao từ hàng đợi, ARCHITECTURE.md
  // §7 luồng B) trước khi tới "nhận". Việc may vá giao thẳng, không có bước này.
  const assignedAt =
    task.line === 'bat' && task.assignees.length > 0
      ? task.assignees.map((a) => a.assignedAt).sort()[0]
      : undefined;

  return (
    <View style={styles.container}>
      {actionError && (
        <Banner
          visible
          icon="alert-circle"
          style={styles.banner}
          actions={[{ label: 'Đóng', onPress: () => setActionError(null) }]}
        >
          {actionError}
        </Banner>
      )}
      {task.measurements && (
        <Text variant="headlineSmall" style={styles.measurements}>
          {task.measurements}
        </Text>
      )}
      <Text variant="titleLarge" style={styles.content}>
        {task.content}
      </Text>
      {task.dueAt && (
        <Text variant="bodyLarge" style={styles.meta}>
          Hạn: {new Date(task.dueAt).toLocaleDateString('vi-VN')}
        </Text>
      )}
      <Text variant="bodyLarge" style={styles.meta}>
        Giao cho: {task.assignees.map((a) => a.user.name).join(', ')}
      </Text>
      <View style={styles.chipRow}>
        <StatusChip task={task} />
      </View>

      {action && (
        <Button
          mode="contained"
          onPress={handleAction}
          loading={submitting}
          disabled={submitting}
          contentStyle={{ height: tapMin }}
          style={styles.actionButton}
        >
          {submitting ? 'Đang gửi…' : actionLabel(action)}
        </Button>
      )}

      <Text variant="labelLarge" style={styles.sec}>
        Việc này đã đi qua
      </Text>
      <Text variant="bodyLarge" style={styles.time}>
        Giao việc · {formatTime(task.createdAt)}
        {assignedAt && (
          <>
            {'\n'}
            Chia cho bạn · {formatTime(assignedAt)}
          </>
        )}
        {'\n'}
        Nhận việc · {ackAt ? formatTime(ackAt) : 'chưa có'}
        {'\n'}
        Bắt đầu làm · {startAt ? formatTime(startAt) : 'chưa có'}
        {'\n'}
        Xong · {doneAt ? formatTime(doneAt) : 'chưa có'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  measurements: { marginBottom: space.md, color: colors.primary },
  content: { marginBottom: space.sm },
  meta: { marginTop: space.xs, color: colors.onSurfaceVariant },
  chipRow: { marginTop: space.md },
  actionButton: { borderRadius: shape.small, marginTop: space.md },
  sec: { color: colors.onSurfaceVariant, marginTop: space.lg, marginBottom: space.sm },
  time: { color: colors.onSurfaceVariant, lineHeight: 32 },
});
