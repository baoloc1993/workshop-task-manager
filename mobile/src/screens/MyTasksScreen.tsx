import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, space, tapMin } from '../theme/tokens';
import { StatusChip } from '../tasks/StatusChip';
import { actionEndpoint, actionLabel, isDoneToday, isOverdue, nextAction } from '../tasks/taskStatus';

// S6 — "Việc của tôi" (PROTOTYPE.md §1). CAP-TASK-11/12/13 (AC-8/9/10): việc đầu hàng có
// nút hành động ngay trên thẻ (≤2 chạm); việc khác chạm mở S7 để báo trạng thái ở đó.
export function MyTasksScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  // dogfood pha I vòng 3: danh sách sắp xếp lại NGAY sau khi action
  // thành công — bấm nhanh liên tiếp ở đúng một vị trí có thể trúng MỘT VIỆC KHÁC vừa
  // trồi lên đúng chỗ đó (ví dụ: request 1 xong rất nhanh, việc mới lên đầu, cú bấm phản
  // xạ thứ 2 tưởng bấm lại việc cũ hoá ra kích hoạt nhầm việc mới). `locked` khoá nút
  // thêm một nhịp ngắn SAU khi request xong, không chỉ trong lúc đang gửi.
  const [locked, setLocked] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Việc chưa xong lên trước (quá hạn trước hết), việc xong hôm nay gấp xuống cuối; việc
  // xong ngày trước không hiện ở đây (lịch sử là CAP-TASK-15, vòng 5 — taskStatus.isDoneToday).
  const { active, doneToday } = useMemo(() => {
    const list = tasks ?? [];
    const activeList = list.filter((t) => t.status !== 'done');
    const doneList = list.filter((t) => t.status === 'done' && isDoneToday(t));
    activeList.sort((a, b) => {
      const overdueDiff = Number(isOverdue(b)) - Number(isOverdue(a));
      if (overdueDiff !== 0) return overdueDiff;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
    });
    return { active: activeList, doneToday: doneList };
  }, [tasks]);

  async function handleAction(task: Task) {
    const action = nextAction(task.status);
    if (!action || locked) return; // đang gửi hoặc vừa xong — khoá (ARCHITECTURE.md §6 + xem `locked`)
    setLocked(true);
    setSubmittingId(task.id);
    setActionError(null);
    try {
      await api.patch<Task>(actionEndpoint(task.id, action));
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSubmittingId(null);
      setTimeout(() => setLocked(false), 500);
    }
  }

  const [first, ...rest] = active;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={rest}
      keyExtractor={(t) => t.id}
      // dogfood pha I vòng 3: trước đây trạng thái rỗng/lỗi trả về
      // <View> tĩnh không có RefreshControl — kéo-làm-mới lúc mất mạng không làm gì cả,
      // im lặng giống hệt "quả thật chưa có việc". Giờ MỌI trạng thái đều nằm trong cùng
      // một FlatList có RefreshControl nên kéo-làm-mới luôn có tác dụng.
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      // dogfood pha I vòng 3: `data` của FlatList là `rest` (mục
      // "Tiếp theo"), nên FlatList tự hiện ListEmptyComponent bất cứ khi nào rest rỗng —
      // kể cả khi vẫn còn `first` ("Làm việc này trước") hoặc `doneToday`. Phải tự kiểm
      // tra rỗng TOÀN MÀN, không dựa vào rỗng của riêng props `data`.
      ListEmptyComponent={
        error || first || doneToday.length > 0 ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Hôm nay chưa có việc nào được giao cho bạn.
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
          {first && (
            <>
              <Text variant="labelLarge" style={styles.sec}>
                Làm việc này trước
              </Text>
              <Card style={styles.card} onPress={() => onOpenTask(first.id)}>
                <Card.Content style={{ gap: space.xs }}>
                  <Text variant="titleLarge">{first.content}</Text>
                  {first.dueAt && (
                    <Text variant="bodyLarge" style={styles.due}>
                      Hạn: {new Date(first.dueAt).toLocaleDateString('vi-VN')}
                    </Text>
                  )}
                  <StatusChip task={first} />
                </Card.Content>
              </Card>
              <Button
                mode="contained"
                onPress={() => handleAction(first)}
                loading={submittingId === first.id}
                disabled={locked}
                contentStyle={{ height: tapMin }}
                style={styles.actionButton}
              >
                {submittingId === first.id ? 'Đang gửi…' : actionLabel(nextAction(first.status)!)}
              </Button>
            </>
          )}
          {rest.length > 0 && (
            <Text variant="labelLarge" style={styles.sec}>
              Tiếp theo
            </Text>
          )}
        </>
      }
      renderItem={({ item }) => (
        <Card style={styles.card} onPress={() => onOpenTask(item.id)}>
          <Card.Content style={{ gap: space.xs }}>
            <Text variant="titleLarge">{item.content}</Text>
            {item.dueAt && (
              <Text variant="bodyLarge" style={styles.due}>
                Hạn: {new Date(item.dueAt).toLocaleDateString('vi-VN')}
              </Text>
            )}
            <StatusChip task={item} />
          </Card.Content>
        </Card>
      )}
      ListFooterComponent={
        doneToday.length > 0 ? (
          <>
            <Text variant="labelLarge" style={[styles.sec, styles.secOk]}>
              Đã xong hôm nay ({doneToday.length})
            </Text>
            {doneToday.map((item) => (
              <Card key={item.id} style={styles.card} onPress={() => onOpenTask(item.id)}>
                <Card.Content style={{ gap: space.xs }}>
                  <Text variant="titleLarge">{item.content}</Text>
                  <StatusChip task={item} />
                </Card.Content>
              </Card>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.surface },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  card: { marginBottom: space.sm, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  due: { color: colors.onSurfaceVariant },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
  actionButton: { borderRadius: 999, marginBottom: space.lg },
});
