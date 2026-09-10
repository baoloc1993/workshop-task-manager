import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Card, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, space } from '../theme/tokens';

// S6 — "Việc của tôi" (PROTOTYPE.md §1). Vòng 1 chưa có nút trạng thái
// (Nhận việc/Bắt đầu/Xong là CAP-TASK-11..13, vòng 3) — chỉ xem, chạm để mở S7.
export function MyTasksScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks/mine');
      setTasks(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Banner visible icon="alert-circle" actions={[{ label: 'Thử lại', onPress: load }]} style={styles.banner}>
          Mất kết nối — đang thử lại
        </Banner>
      </View>
    );
  }

  if (tasks && tasks.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          Hôm nay chưa có việc nào được giao cho bạn.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md }}
      data={tasks ?? []}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      renderItem={({ item }) => (
        <Card style={styles.card} onPress={() => onOpenTask(item.id)}>
          <Card.Content>
            <Text variant="titleLarge">{item.content}</Text>
            {item.dueAt && (
              <Text variant="bodyLarge" style={styles.due}>
                Hạn: {new Date(item.dueAt).toLocaleDateString('vi-VN')}
              </Text>
            )}
          </Card.Content>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { margin: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.surface },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  card: { marginBottom: space.sm, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  due: { marginTop: space.xs, color: colors.onSurfaceVariant },
});
