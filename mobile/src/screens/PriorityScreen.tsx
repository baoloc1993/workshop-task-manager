import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, IconButton, Text } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space } from '../theme/tokens';
import { isOverdue, lineLabel, statusColor } from '../tasks/taskStatus';
import { LoadErrorBanner } from '../common/LoadErrorBanner';
import { SkeletonCard } from '../common/SkeletonCard';
import { useAuth } from '../auth/AuthContext';
import { ErrorIcon } from '../common/bannerParts';

// S4 — "Việc nào làm trước" (CAP-TASK-07, AC-14). Bấm mũi tên đổi vị trí → priority cập
// nhật NGAY, không có nút "Lưu" riêng (PROTOTYPE.md §1). Mỗi lần đổi gửi NGUYÊN danh sách
// task_id theo thứ tự mới (DECISIONS.md vòng 5) — server gán lại priority tuần tự.
export function PriorityScreen() {
  const { logout } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  // AC-30 (vòng 8, CAP-BUG-01) — giữ lỗi gốc để `LoadErrorBanner` phân biệt mất mạng/401/500.
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks');
      setTasks(data.filter((t) => t.status !== 'done'));
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

  // AC-36 (vòng 8, CAP-BUG-01) — cùng khuôn đã sửa ở MyTasksScreen/OrderListScreen: trước
  // khi có lần tải đầu tiên, màn này trắng trơn (ListEmptyComponent trả null).
  if (tasks === null && error === null) {
    return (
      <View style={styles.container}>
        <ScreenTitle>Việc nào làm trước</ScreenTitle>
        <View style={{ padding: space.md }}>
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={list}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        error !== null || tasks === null ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Chưa có việc nào để sắp.
            </Text>
          </View>
        )
      }
      ListHeaderComponent={
        <>
          <ScreenTitle>Việc nào làm trước</ScreenTitle>
          {error !== null && <LoadErrorBanner error={error} onRetry={load} onReauth={logout} />}
          {saveError && (
            <Banner
              visible
              icon={ErrorIcon}
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
        const dotColor = statusColor(item);
        return (
          // C3 — hàng việc (DESIGN-SYSTEM.md §4): không dùng TaskRow dùng chung ở đây vì
          // hàng này không bấm-mở-chi-tiết mà mang hai IconButton lên/xuống ngay trên hàng.
          <View style={styles.row}>
            <View style={[styles.dot, { borderColor: dotColor }, item.status === 'done' && { backgroundColor: dotColor }]} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={styles.title} numberOfLines={2}>
                {index + 1}. {item.content}
              </Text>
              <Text style={styles.who}>
                {who} · {lineLabel(item.line)}
                {item.dueAt ? ` · hạn ${new Date(item.dueAt).toLocaleDateString('vi-VN')}` : ''}
                {isOverdue(item) ? ' · Quá hạn' : ''}
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
          </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: 3,
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  title: { fontSize: fontSize.body, color: colors.onSurface },
  who: { color: colors.onSurfaceVariant, fontSize: fontSize.label },
});
