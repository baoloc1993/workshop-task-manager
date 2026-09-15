import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, space } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';

function BatTaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const who = task.assignees.length > 0 ? `Đang giao: ${task.assignees.map((a) => a.user.name).join(', ')}` : null;
  return (
    <TaskRow
      task={task}
      title={task.content}
      metaParts={[who, task.dueAt ? `hạn ${new Date(task.dueAt).toLocaleDateString('vi-VN')}` : null]}
      // dogfood pha I vòng 4: trạng thái "Chưa nhận" hiện GIỐNG HỆT cho
      // cả việc chưa-giao-ai lẫn việc đã-giao-nhưng-thợ-chưa-bấm-nhận, gây hiểu nhầm "chưa
      // chia" thành "đã chia rồi". Chỉ hiện trạng thái khi ĐÃ có người được giao — việc
      // chưa chia thì mục "Chờ bạn chia cho thợ" đã đủ nói.
      showStatus={task.assignees.length > 0}
      topLine={task.measurements ? <Text style={styles.measure}>{task.measurements}</Text> : undefined}
      onPress={onPress}
    />
  );
}

// S9 — "Việc bạt chờ chia" (PROTOTYPE.md §1). CAP-TASK-06 (AC-13): điều phối (hoặc chủ xưởng)
// thấy việc bạt CHƯA chia trước (kèm số đo), việc ĐÃ chia trong nhóm sau — không lục Zalo.
export function BatQueueScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks/bat-queue');
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

  const list = tasks ?? [];
  const waiting = list.filter((t) => t.assignees.length === 0);
  const assigned = list.filter((t) => t.assignees.length > 0);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={waiting}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      // Rỗng TOÀN MÀN (chưa-chia lẫn đã-chia đều không có gì) — không dựa vào rỗng của
      // riêng `data` (bài học dogfood pha I vòng 3, MyTasksScreen: DECISIONS.md 2026-09-11).
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
          {error && (
            <Banner visible icon="alert-circle" actions={[{ label: 'Thử lại', onPress: load }]} style={styles.banner}>
              Mất kết nối — đang thử lại
            </Banner>
          )}
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
  // C6 (DESIGN-SYSTEM.md §4): số đo giữ cỡ --text-headline dù nằm trong hàng việc — sai một
  // chữ số là hỏng vật tư, không được thu nhỏ theo bố cục hàng.
  measure: { fontSize: fontSize.headline, color: colors.primary, fontWeight: '600' },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
});
