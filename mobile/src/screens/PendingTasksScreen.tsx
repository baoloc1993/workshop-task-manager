import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Button, Snackbar, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { ScreenTitle } from '../common/ScreenTitle';
import { SkeletonCard } from '../common/SkeletonCard';
import { LoadErrorBanner } from '../common/LoadErrorBanner';
import { StatusPill, pillKindOf } from '../tasks/StatusPill';
import { formatTime, lineLabel } from '../tasks/taskStatus';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';

type Decision = 'approve' | 'reject';

function writtenAt(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `ghi lúc ${formatTime(iso)}` : `ghi ${d.toLocaleDateString('vi-VN')} lúc ${formatTime(iso)}`;
}

// Chủ xưởng quyết việc
// thợ tự ghi có vào hệ thống hay không. Việc chờ lâu nhất trước. Thẻ có nút bên trong nên
// thẻ là View, không phải Pressable (§4b luật 2 "không lồng nút trong nút").
export function PendingTasksScreen() {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // hàng vừa quyết biến mất ngay → hàng dưới trượt lên đúng chỗ
  // ngón tay, lần chạm lại 0,4–2 giây sau (người vội tưởng máy chưa nhận) duyệt nhầm việc của
  // NGƯỜI KHÁC. Giữ hàng tại chỗ với chữ kết quả ~1,5 giây rồi mới gỡ, và khoá mọi nút tới
  // ~0,8 giây sau khi gỡ (bố cục đã đứng yên).
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [locked, setLocked] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks/pending');
      setTasks(data);
      setError(null);
    } catch (e) {
      // §5 "Lỗi": giữ nguyên danh sách đang đọc (không xoá `tasks`).
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

  const sorted = useMemo(
    () => [...(tasks ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [tasks],
  );

  // "Không duyệt" không đảo ngược được (API chỉ pending → rejected)
  // và nằm sát "Duyệt" — hỏi lại một lần trước khi bỏ.
  function confirmReject(task: Task) {
    if (busyId || locked) return;
    const who = task.assignees[0]?.user.name ?? 'thợ';
    Alert.alert('Không duyệt việc này?', `"${task.content}" của ${who} sẽ rời danh sách, không lấy lại được.`, [
      { text: 'Thôi', style: 'cancel' },
      { text: 'Không duyệt', style: 'destructive', onPress: () => void decide(task, 'reject') },
    ]);
  }

  async function decide(task: Task, decision: Decision) {
    if (busyId || locked) return; // một quyết định một lúc — tránh bấm chồng hai hàng
    setBusyId(task.id);
    setLocked(true);
    let ok = false;
    const who = task.assignees[0]?.user.name ?? 'thợ';
    try {
      await api.post(`/tasks/${task.id}/${decision}`);
      if (user) track(decision === 'approve' ? 'duyet_viec_tu_ghi' : 'khong_duyet_viec_tu_ghi', user.id, { taskId: task.id });
      ok = true;
      // Hàng rời danh sách — nhưng sau 1,5 giây, không phải ngay (xem ghi chú `decided`).
      setDecided((d) => ({ ...d, [task.id]: decision }));
      setTimeout(() => {
        setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
        setTimeout(() => setLocked(false), 800);
      }, 1500);
      setSnack(decision === 'approve' ? `Đã duyệt việc của ${who}.` : `Đã không duyệt việc của ${who}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // việc đã được quyết (chủ khác bấm trước) → 409.
        setSnack('Việc này đã được quyết rồi — đã tải lại danh sách.');
        await load();
      } else {
        setSnack(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
      }
    } finally {
      setBusyId(null);
      if (!ok) setLocked(false);
    }
  }

  const header = (
    <>
      <ScreenTitle>Việc chờ duyệt</ScreenTitle>
      {/* giữ dòng giải thích cả khi rỗng — người mới vào màn rỗng vẫn cần biết
          màn này để làm gì. */}
      <Text style={styles.hint}>Thợ tự ghi. Duyệt thì việc vào danh sách cả xưởng như việc bạn giao.</Text>
    </>
  );

  // §5 "Đang tải": khung xám đúng chỗ, không vòng xoay.
  if (tasks === null && error === null) {
    return (
      <View style={[styles.container, { padding: space.md }]}>
        {header}
        <SkeletonCard count={2} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* C5 bám mép trên, ngoài danh sách cuộn (LoadErrorBanner.tsx). */}
      {error !== null && (
        <View style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>
          <LoadErrorBanner error={error} onRetry={load} onReauth={logout} />
        </View>
      )}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
        data={sorted}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error !== null ? null : (
            <View style={styles.empty}>
              <Text variant="bodyLarge" style={styles.emptyText}>
                Không có việc nào chờ duyệt.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const kind = pillKindOf(item);
          const who = item.assignees[0]?.user.name ?? '—';
          const busy = busyId === item.id;
          const done = decided[item.id];
          return (
            <View style={styles.card}>
              <Text style={styles.title}>{item.content}</Text>
              <View style={styles.subRow}>
                {/* thợ có thể đã bắt đầu làm trong lúc chờ. Việc
                    đã xong không có chip C22, dùng chữ "Xong" màu tertiary như C8. */}
                {kind ? <StatusPill kind={kind} /> : <Text style={styles.doneText}>Xong</Text>}
                <Text style={styles.meta}>
                  {[who, lineLabel(item.line), writtenAt(item.createdAt)].join(' · ')}
                </Text>
              </View>
              {done ? (
                <Text style={[styles.doneLine, done === 'reject' && { color: colors.error }]}>
                  {done === 'approve' ? '✓ Đã duyệt' : 'Đã không duyệt'}
                </Text>
              ) : (
              <View style={styles.actions}>
                <Button
                  mode="contained"
                  onPress={() => decide(item, 'approve')}
                  disabled={!!busyId || locked}
                  loading={busy}
                  style={styles.approve}
                  contentStyle={{ minHeight: tapMin }}
                >
                  Duyệt
                </Button>
                <Button
                  mode="text"
                  onPress={() => confirmReject(item)}
                  disabled={!!busyId || locked}
                  textColor={colors.error}
                  style={styles.reject}
                  contentStyle={{ minHeight: tapMin }}
                >
                  Không duyệt
                </Button>
              </View>
              )}
            </View>
          );
        }}
      />
      {/* C15 Snackbar — nền on-surface, chữ surface, bo --shape-small, tự tắt. */}
      <Snackbar
        visible={snack !== null}
        onDismiss={() => setSnack(null)}
        duration={3000}
        style={styles.snack}
        theme={{ colors: { inverseOnSurface: colors.surface } }}
      >
        {snack ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  doneLine: { minHeight: tapMin, textAlignVertical: 'center', fontSize: fontSize.body, fontWeight: '600', color: colors.tertiary },
  hint: { fontSize: fontSize.label, color: colors.onSurfaceVariant, marginBottom: space.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  // C3 hàng việc: nền trắng bo --shape-small, bóng --elevation-1, cách nhau 3px.
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    padding: space.md,
    marginBottom: 3,
    gap: space.xs,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  title: { fontSize: fontSize.body, color: colors.onSurface },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm, rowGap: 2 },
  meta: { fontSize: fontSize.label, color: colors.onSurfaceVariant, flexShrink: 1 },
  doneText: { fontSize: fontSize.label, color: colors.tertiary, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  approve: { borderRadius: shape.small, flex: 1 },
  reject: { borderRadius: shape.small },
  snack: { backgroundColor: colors.onSurface, borderRadius: shape.small },
});
