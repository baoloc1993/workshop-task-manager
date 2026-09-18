import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SectionList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, navHeight, space, tapMin } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';
import { isDoneToday, lineLabel, taskBucket } from '../tasks/taskStatus';
import { ScreenHeader } from '../common/ScreenHeader';
import { SkeletonCard } from '../common/SkeletonCard';

// S1 — "Cả xưởng hôm nay" (CAP-TASK-08, AC-15). Đúng bốn nhóm của PROTOTYPE.md §1: quá
// hạn/đứng yên → đang làm → chưa ai nhận → đã xong hôm nay (gấp lại cuối màn). Dữ liệu từ
// GET /tasks (owner-only), gom nhóm bằng hàm thuần taskBucket() (DECISIONS.md vòng 5).
function OverviewRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const who = task.assignees.length > 0 ? task.assignees.map((a) => a.user.name).join(', ') : 'Chưa ai nhận';
  return (
    <TaskRow
      task={task}
      title={task.content}
      metaParts={[who, lineLabel(task.line), task.dueAt ? `hạn ${new Date(task.dueAt).toLocaleDateString('vi-VN')}` : null]}
      onPress={onPress}
    />
  );
}

export function OwnerHomeScreen({
  onOpenTask,
  onCreateTask,
  onVoiceCapture,
}: {
  onOpenTask: (id: string) => void;
  onCreateTask: () => void;
  onVoiceCapture: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Task[]>('/tasks');
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

  const sections = useMemo(() => {
    const list = tasks ?? [];
    const active = list.filter((t) => t.status !== 'done');
    const doneToday = list.filter((t) => t.status === 'done' && isDoneToday(t));
    // filter() giữ nguyên thứ tự đã sắp từ server (priority asc) — không cần sắp lại.
    const overdueOrStale = active.filter((t) => taskBucket(t) === 'overdueOrStale');
    const inProgress = active.filter((t) => taskBucket(t) === 'inProgress');
    const unassigned = active.filter((t) => taskBucket(t) === 'unassigned');

    return [
      { key: 'late', title: 'Quá hạn hoặc đứng yên', data: overdueOrStale },
      { key: 'doing', title: 'Đang làm', data: inProgress },
      { key: 'wait', title: 'Chưa ai nhận', data: unassigned },
      { key: 'done', title: `Đã xong hôm nay (${doneToday.length})`, data: doneToday },
    ].filter((s) => s.data.length > 0);
  }, [tasks]);

  const isEmpty = tasks !== null && tasks.length === 0;

  // AC-36 (vòng 8, CAP-BUG-01) — trước tải xong lần đầu màn này trắng trơn (không khung
  // xám nào) — DESIGN-SYSTEM.md §5 đòi khuôn "đang tải" giữ đúng chỗ.
  if (tasks === null && !error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Cả xưởng hôm nay" canGoBack />
        <View style={{ padding: space.md }}>
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Cả xưởng hôm nay" canGoBack />
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
        sections={sections}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          error || !isEmpty ? null : (
            <View style={styles.empty}>
              <Text variant="bodyLarge" style={styles.emptyText}>
                Chưa có việc nào.
              </Text>
            </View>
          )
        }
        ListHeaderComponent={
          error ? (
            <Banner visible icon="alert-circle" actions={[{ label: 'Thử lại', onPress: load }]} style={styles.banner}>
              Mất kết nối — đang thử lại. Danh sách bên dưới là lần cập nhật gần nhất.
            </Banner>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text variant="labelLarge" style={[styles.sec, section.key === 'done' && styles.secOk]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => <OverviewRow task={item} onPress={() => onOpenTask(item.id)} />}
      />
      {/* C7 — thanh thêm ghim đáy (DESIGN-SYSTEM.md §4), thay cho FAB micro nổi. */}
      <View style={styles.addBar}>
        <Button
          mode="text"
          onPress={onVoiceCapture}
          style={styles.addBarPrimary}
          contentStyle={{ height: navHeight }}
          labelStyle={styles.addBarLabel}
        >
          ＋ Nói để giao việc
        </Button>
        {/* dogfood pha I vòng 6: thiếu contentStyle height so với
            mọi nút khác trên màn — đo được 38dp, dưới --tap-min 48px (§2.3). */}
        <Button mode="text" onPress={onCreateTask} compact contentStyle={{ height: tapMin }}>
          Gõ tay
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainer,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingHorizontal: space.md,
  },
  addBarPrimary: { flex: 1, justifyContent: 'center' },
  addBarLabel: { color: colors.primary, fontWeight: '700' },
});
