import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, space } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';
import { LoadErrorBanner } from '../common/LoadErrorBanner';
import { SkeletonCard } from '../common/SkeletonCard';

function BatTaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const who = task.assignees.length > 0 ? `Đang giao: ${task.assignees.map((a) => a.user.name).join(', ')}` : null;
  return (
    <TaskRow
      task={task}
      title={task.content}
      metaParts={[who, task.dueAt ? `hạn ${new Date(task.dueAt).toLocaleDateString('vi-VN')}` : null]}
      // trạng thái "Chưa nhận" hiện GIỐNG HỆT cho
      // cả việc chưa-giao-ai lẫn việc đã-giao-nhưng-thợ-chưa-bấm-nhận, gây hiểu nhầm "chưa
      // chia" thành "đã chia rồi". Chỉ hiện trạng thái khi ĐÃ có người được giao — việc
      // chưa chia thì mục "Chờ bạn chia cho thợ" đã đủ nói.
      showStatus={task.assignees.length > 0}
      topLine={task.measurements ? <Text style={styles.measure}>{task.measurements}</Text> : undefined}
      onPress={onPress}
    />
  );
}

// "Việc bạt chờ chia".: điều phối (hoặc chủ xưởng)
// thấy việc bạt CHƯA chia trước (kèm số đo), việc ĐÃ chia trong nhóm sau — không lục Zalo.
export function BatQueueScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  // giữ lỗi gốc (NetworkError/ApiError) thay vì gộp về boolean,
  // để LoadErrorBanner phân biệt mất mạng/401/500 (cùng khuôn MyTasksScreen/TaskDetailScreen).
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks/bat-queue');
      setTasks(data);
      setError(null);
    } catch (e) {
      setError(e);
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

  const list = tasks ?? [];
  const waiting = list.filter((t) => t.assignees.length === 0);
  const assigned = list.filter((t) => t.assignees.length > 0);

  // khuôn tải, xem MyTasksScreen cùng khuôn.
  if (tasks === null && !error) {
    return (
      <View style={[styles.container, { padding: space.md }]}>
        <SkeletonCard />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={waiting}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      // Rỗng TOÀN MÀN (chưa-chia lẫn đã-chia đều không có gì) — không dựa vào rỗng của
      // riêng `data` (MyTasksScreen).
      ListEmptyComponent={
        error || assigned.length > 0 ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Chưa có việc bạt nào chờ chia.
            </Text>
          </View>
        )
      }
      ListHeaderComponent={
        <>
          {!!error && <LoadErrorBanner error={error} onRetry={load} />}
          {waiting.length > 0 && (
            <Text variant="labelLarge" style={styles.sec}>
              Chờ bạn chia cho thợ
            </Text>
          )}
        </>
      }
      renderItem={({ item }) => <BatTaskRow task={item} onPress={() => onOpenTask(item.id)} />}
      ListFooterComponent={
        assigned.length > 0 ? (
          <>
            <Text variant="labelLarge" style={[styles.sec, styles.secOk]}>
              Đã chia trong nhóm
            </Text>
            {assigned.map((item) => (
              <BatTaskRow key={item.id} task={item} onPress={() => onOpenTask(item.id)} />
            ))}
          </>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  // số đo giữ cỡ --text-headline dù nằm trong hàng việc — sai một
  // chữ số là hỏng vật tư, không được thu nhỏ theo bố cục hàng.
  measure: { fontSize: fontSize.headline, color: colors.primary, fontWeight: '600' },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
});
