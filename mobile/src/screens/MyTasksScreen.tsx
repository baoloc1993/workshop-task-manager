import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Snackbar, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task, TaskApproval } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';
import { StatusPill } from '../tasks/StatusPill';
import { actionEndpoint, actionLabel, isDoneToday, isOverdue, nextAction } from '../tasks/taskStatus';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';
import { LoadErrorBanner } from '../common/LoadErrorBanner';
import { SkeletonCard } from '../common/SkeletonCard';
import { ErrorIcon } from '../common/bannerParts';

// S6 — "Việc của tôi" (PROTOTYPE.md §1). CAP-TASK-11/12/13 (AC-8/9/10): việc đầu hàng có
// nút hành động ngay trên thẻ (≤2 chạm); việc khác chạm mở S7 để báo trạng thái ở đó.
// Vòng 9 (AC-40, C22) — việc tự ghi đang chờ chủ duyệt: chip "Chờ chủ duyệt" đầu dòng phụ,
// vẫn giữ chữ trạng thái C8 phía sau (thợ vẫn bấm nhận/bắt đầu/xong được trong lúc chờ).
function pendingPill(task: Task) {
  return task.approval === 'pending' ? <StatusPill kind="pending" /> : undefined;
}

/** dogfood vòng 9 (newbie) — kết quả S30 mang về S6. `at` để cùng một câu ghi hai lần liền
 * vẫn hiện Snackbar lần hai (param giống hệt thì effect không chạy lại). */
export type SelfTaskResult = { approval?: TaskApproval; at: number };

function selfResultMessage(approval?: TaskApproval): string {
  if (approval === 'pending') return 'Đã ghi — chờ chủ xưởng duyệt.';
  if (approval === 'approved') return 'Đã ghi vào danh sách của bạn.';
  // response thiếu `approval` (server cũ) — không đoán là đã duyệt hay chưa.
  return 'Đã ghi việc.';
}

export function MyTasksScreen({
  onOpenTask,
  onSelfTask,
  selfResult,
}: {
  onOpenTask: (id: string) => void;
  // AC-40 — lối "＋ Ghi việc tôi làm" → S30. Không truyền (thợ mảng đệm) thì không hiện.
  onSelfTask?: () => void;
  selfResult?: SelfTaskResult;
}) {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  // AC-30 (vòng 8, CAP-BUG-01) — giữ nguyên lỗi gốc (NetworkError/ApiError) thay vì gộp
  // hết vào một boolean, để `LoadErrorBanner` phân biệt được loại lỗi.
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  // dogfood pha I vòng 3: danh sách sắp xếp lại NGAY sau khi action
  // thành công — bấm nhanh liên tiếp ở đúng một vị trí có thể trúng MỘT VIỆC KHÁC vừa
  // trồi lên đúng chỗ đó (ví dụ: request 1 xong rất nhanh, việc mới lên đầu, cú bấm phản
  // xạ thứ 2 tưởng bấm lại việc cũ hoá ra kích hoạt nhầm việc mới). `locked` khoá nút
  // thêm một nhịp ngắn SAU khi request xong, không chỉ trong lúc đang gửi.
  const [locked, setLocked] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // C15 Snackbar — dogfood vòng 9 (newbie): ghi ở S30 xong thợ quay về đây mà không có lời
  // nào nói việc đã vào chưa / có phải chờ chủ duyệt không (§4c: im lặng ≠ thành công).
  const [snack, setSnack] = useState<string | null>(null);
  // dogfood vòng 9 (meta): gửi ở S30 chậm → người dùng chạm lại "Ghi việc", lượt chạm đó rơi
  // xuống thẻ việc MỚI vừa hiện đúng chỗ nút và mở luôn S7. Bỏ qua chạm ~0,7 giây sau khi quay về.
  const ignoreTapsUntil = useRef(0);
  const guarded = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    if (Date.now() < ignoreTapsUntil.current) return;
    fn(...args);
  };
  useEffect(() => {
    if (selfResult) ignoreTapsUntil.current = Date.now() + 700;
    if (selfResult) setSnack(selfResultMessage(selfResult.approval));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfResult?.at]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks/mine');
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

  // AC-36 (vòng 8, CAP-BUG-01) — khuôn tải: trước khi có lần tải đầu tiên (`tasks === null`)
  // FlatList vẫn dựng ListEmptyComponent, chớp qua "Hôm nay chưa có việc" trước khi dữ liệu
  // thật tới — khuôn xám giữ đúng chỗ, đúng DESIGN-SYSTEM.md §5.
  const snackbar = (
    // C15 Snackbar — nền on-surface, chữ surface, bo --shape-small, tự tắt (cùng khuôn S31).
    <Snackbar
      visible={snack !== null}
      onDismiss={() => setSnack(null)}
      duration={3000}
      style={styles.snack}
      theme={{ colors: { inverseOnSurface: colors.surface } }}
    >
      {snack ?? ''}
    </Snackbar>
  );

  if (tasks === null && error === null) {
    return (
      <View style={styles.container}>
        <View style={{ padding: space.md }}>
          <SkeletonCard />
        </View>
        {snackbar}
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
            {/* C4 — rỗng có đúng MỘT nút khi vai có quyền tạo (§5); nút ghim dưới danh sách
                ẩn ở trạng thái này để không trùng hai nút cùng nghĩa. */}
            {onSelfTask && (
              <Button mode="contained" onPress={onSelfTask} style={styles.emptyButton} contentStyle={{ height: tapMin }}>
                ＋ Ghi việc tôi làm
              </Button>
            )}
          </View>
        )
      }
      ListHeaderComponent={
        <>
          {error !== null && <LoadErrorBanner error={error} onRetry={load} onReauth={logout} />}
          {actionError && (
            <Banner
              visible
              icon={ErrorIcon}
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
                pill={pendingPill(first)}
                onPress={guarded(() => onOpenTask(first.id))}
              />
              <Button
                mode="contained"
                onPress={guarded(() => handleAction(first))}
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
          pill={pendingPill(item)}
          onPress={guarded(() => onOpenTask(item.id))}
        />
      )}
      ListFooterComponent={
        <>
          {/* AC-40 — prototype S6 `.btn.ghost` ngay dưới việc đang làm, trên "Đã xong hôm nay".
              Nút phụ (viền outline) — nút chính C1 của màn vẫn là nút hành động việc đầu. */}
          {onSelfTask && (first || doneToday.length > 0) && (
            <Button
              mode="outlined"
              onPress={onSelfTask}
              style={styles.selfButton}
              contentStyle={{ height: tapMin }}
              textColor={colors.primary}
            >
              ＋ Ghi việc tôi làm
            </Button>
          )}
          {doneToday.length > 0 ? (
          <>
            <Text variant="labelLarge" style={[styles.sec, styles.secOk]}>
              Đã xong hôm nay ({doneToday.length})
            </Text>
            {/* dogfood vòng 9 (newbie): việc tự ghi đã xong nhưng chủ chưa duyệt vẫn giữ chip
                "Chờ chủ duyệt" — trước đây chip mất ngay khi xong, thợ tưởng đã được duyệt. */}
            {doneToday.map((item) => (
              <TaskRow
                key={item.id}
                task={item}
                title={item.content}
                pill={pendingPill(item)}
                onPress={guarded(() => onOpenTask(item.id))}
              />
            ))}
          </>
          ) : null}
        </>
      }
    />
    {snackbar}
    </View>
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
  selfButton: { borderRadius: shape.small, borderColor: colors.outline, marginTop: space.md },
  emptyButton: { borderRadius: shape.small, marginTop: space.md },
  snack: { backgroundColor: colors.onSurface, borderRadius: shape.small },
});
