import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, space } from '../theme/tokens';

// S7 — chi tiết việc. Vòng 1 chưa có nút trạng thái (xem MyTasksScreen).
export function TaskDetailScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<Task>(`/tasks/${taskId}`)
      .then(setTask)
      .catch(() => setError(true));
  }, [taskId]);

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

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md, backgroundColor: colors.surface },
  banner: { backgroundColor: colors.errorContainer },
  measurements: { marginBottom: space.md, color: colors.primary },
  content: { marginBottom: space.sm },
  meta: { marginTop: space.xs, color: colors.onSurfaceVariant },
});
