import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';
import { actionEndpoint, actionLabel, isDoneToday, isOverdue, nextAction } from '../tasks/taskStatus';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';

// S6 — "Việc của tôi" (PROTOTYPE.md §1). CAP-TASK-11/12/13 (AC-8/9/10): việc đầu hàng có
// nút hành động ngay trên thẻ (≤2 chạm); việc khác chạm mở S7 để báo trạng thái ở đó.
export function MyTasksScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { user } = useAuth();
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
    // dogfood pha I vòng 7: nút "Báo xong" tắt tại đây gọi thẳng
    // actionEndpoint(done) — với việc "đi đo" mảng đệm (step='do'), việc đó không bao giờ
    // đi qua S20 (form số đo/ảnh trong TaskDetailScreen), nên thợ bấm xong mà chưa hề thấy
    // ô số đo/nút chụp ảnh. Đường "báo xong" của riêng bước đi đo phải qua màn chi tiết.
    if (action === 'done' && task.line === 'dem' && task.step === 'do') {
      onOpenTask(task.id);
      return;
    }
    setLocked(true);
    setSubmittingId(task.id);
    setActionError(null);
    try {
      await api.patch<Task>(actionEndpoint(task.id, action));
      // Nhóm 4 production-ready — H3 (PRD.md §6): "viec_xong" là hoàn tất luồng lõi phía
      // công nhân/điều phối, chỉ số quyết định go/pivot/kill ở pilot vòng 7.
      if (user) track(`viec_${action}`, user.id, { taskId: task.id });
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
              <TaskRow
                task={first}
                title={first.content}
                metaParts={[first.dueAt ? `hạn ${new Date(first.dueAt).toLocaleDateString('vi-VN')}` : null]}
                onPress={() => onOpenTask(first.id)}
              />
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
        <TaskRow
          task={item}
          title={item.content}
          metaParts={[item.dueAt ? `hạn ${new Date(item.dueAt).toLocaleDateString('vi-VN')}` : null]}
          onPress={() => onOpenTask(item.id)}
        />
      )}
      ListFooterComponent={
        doneToday.length > 0 ? (
          <>
            <Text variant="labelLarge" style={[styles.sec, styles.secOk]}>
              Đã xong hôm nay ({doneToday.length})
            </Text>
            {doneToday.map((item) => (
              <TaskRow key={item.id} task={item} title={item.content} onPress={() => onOpenTask(item.id)} />
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
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
  actionButton: { borderRadius: shape.small, marginBottom: space.lg },
});
