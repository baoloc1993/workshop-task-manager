import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Card, IconButton, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, space } from '../theme/tokens';
import { lineLabel } from '../tasks/taskStatus';

// S4 — "Việc nào làm trước" (CAP-TASK-07, AC-14). Bấm mũi tên đổi vị trí → priority cập
// nhật NGAY, không có nút "Lưu" riêng (PROTOTYPE.md §1). Mỗi lần đổi gửi NGUYÊN danh sách
// task_id theo thứ tự mới (DECISIONS.md vòng 5) — server gán lại priority tuần tự.
export function PriorityScreen() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks');
      setTasks(data.filter((t) => t.status !== 'done'));
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

  async function move(index: number, direction: -1 | 1) {
    if (!tasks || saving) return;
    const target = index + direction;
    if (target < 0 || target >= tasks.length) return;

    const reordered = [...tasks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const previous = tasks;
    setTasks(reordered); // cập nhật ngay trên màn — không đợi server trả lời
    setSaving(true);
    setSaveError(false);
    try {
      await api.patch<Task[]>('/tasks/reorder', { taskIds: reordered.map((t) => t.id) });
    } catch (e) {
      setTasks(previous); // Không lưu được thứ tự — trả về thứ tự cũ (PROTOTYPE.md §1)
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const list = tasks ?? [];

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={list}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        error || tasks === null ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Chưa có việc nào để sắp.
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
          {saveError && (
            <Banner
              visible
              icon="alert-circle"
              actions={[{ label: 'Đóng', onPress: () => setSaveError(false) }]}
              style={styles.banner}
            >
              Không lưu được thứ tự — đã trả về thứ tự cũ.
            </Banner>
          )}
          {list.length > 0 && (
            <Text variant="bodyLarge" style={styles.hint}>
              Việc ở trên cùng là việc thợ thấy đầu tiên.
            </Text>
          )}
        </>
      }
      renderItem={({ item, index }) => {
        const who = item.assignees.length > 0 ? item.assignees.map((a) => a.user.name).join(', ') : 'Chưa ai nhận';
        return (
          <Card style={styles.card}>
            <Card.Content style={styles.row}>
              <View style={{ flex: 1, gap: space.xs }}>
                <Text variant="titleLarge" numberOfLines={2}>
                  {index + 1}. {item.content}
                </Text>
                <Text variant="bodyLarge" style={styles.who}>
                  {who} · {lineLabel(item.line)}
                  {item.dueAt ? ` · hạn ${new Date(item.dueAt).toLocaleDateString('vi-VN')}` : ''}
                </Text>
              </View>
              <View>
                <IconButton
                  icon="arrow-up"
                  disabled={index === 0 || saving}
                  onPress={() => move(index, -1)}
                  accessibilityLabel="Lên trên"
                />
                <IconButton
                  icon="arrow-down"
                  disabled={index === list.length - 1 || saving}
                  onPress={() => move(index, 1)}
                  accessibilityLabel="Xuống dưới"
                />
              </View>
            </Card.Content>
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  hint: { color: colors.onSurfaceVariant, marginBottom: space.md },
  card: { marginBottom: space.sm, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  who: { color: colors.onSurfaceVariant },
});
