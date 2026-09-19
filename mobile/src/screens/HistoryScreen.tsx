import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Chip, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { chipHitSlop, colors, space, tapMin } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';
import { formatTime, lineLabel } from '../tasks/taskStatus';
import { SkeletonCard } from '../common/SkeletonCard';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

type Range = 'week' | 'month';

// S16 — "Việc đã xong" (CAP-TASK-15, AC-16). Dùng chung cho cả ba vai — server tự lọc theo
// vai (owner: toàn xưởng · worker: của mình · bat_coordinator: của mình + nhóm bạt), màn
// chỉ hiển thị đúng những gì API trả (PERSONAS.md §2, ARCHITECTURE.md §8).
export function HistoryScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [range, setRange] = useState<Range>('week');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (r: Range) => {
    try {
      const data = await api.get<Task[]>(`/tasks/history?range=${r}`);
      setTasks(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Refetch khi màn được focus HOẶC khi đổi bộ lọc Tuần này/Tháng này lúc màn đang mở.
  useFocusEffect(
    useCallback(() => {
      load(range);
    }, [load, range]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(range);
    setRefreshing(false);
  }

  const list = tasks ?? [];
  const rangeLabel = range === 'week' ? 'tuần này' : 'tháng này';

  // AC-36 (vòng 8, CAP-BUG-01) — cùng lớp lỗi: trước tải xong lần đầu, chớp câu rỗng
  // "Chưa có việc nào xong" (DESIGN-SYSTEM.md §5 đòi khung xám lúc đang tải).
  if (tasks === null && !error) {
    return (
      <View style={styles.container}>
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
        error ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Chưa có việc nào xong trong khoảng này.
            </Text>
          </View>
        )
      }
      ListHeaderComponent={
        <>
          {error && (
            <Banner
              visible
              icon={ErrorIcon}
              actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: () => load(range) }]}
              style={styles.banner}
            >
              Không tải được lịch sử
            </Banner>
          )}
          <View style={styles.chips}>
            {(['week', 'month'] as const).map((r) => (
              <Chip
                key={r}
                mode={range === r ? 'flat' : 'outlined'}
                selected={range === r}
                onPress={() => setRange(r)}
                style={[styles.chip, range === r && styles.chipSelected]}
                textStyle={range === r ? styles.chipSelectedText : styles.chipTextUnselected}
                selectedColor={range === r ? colors.onPrimaryContainer : colors.onSurface}
                hitSlop={chipHitSlop}
              >
                {r === 'week' ? 'Tuần này' : 'Tháng này'}
              </Chip>
            ))}
          </View>
          {list.length > 0 && (
            <Text variant="labelLarge" style={styles.sec}>
              Đã xong — {list.length} việc {rangeLabel}
            </Text>
          )}
        </>
      }
      renderItem={({ item }) => {
        const who = item.assignees.map((a) => a.user.name).join(', ') || '—';
        const doneAt = item.events.find((e) => e.kind === 'done')?.at;
        return (
          <TaskRow
            task={item}
            title={item.content}
            metaParts={[
              who,
              lineLabel(item.line),
              doneAt ? `xong ${new Date(doneAt).toLocaleDateString('vi-VN')} lúc ${formatTime(doneAt)}` : null,
            ]}
            // Mọi việc ở S16 đều đã xong (server chỉ trả done) — dòng phụ đã nói "xong lúc
            // <giờ>", nhắc lại trạng thái "Xong" lần nữa là thừa.
            showStatus={false}
            onPress={() => onOpenTask(item.id)}
          />
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
  chips: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  // dogfood pha I vòng 6: Chip mặc định của Paper ~34dp, dưới
  // --tap-min 48px (DESIGN-SYSTEM.md §2.3) — ép chiều cao + canh giữa chữ.
  chip: { borderColor: colors.outline, minHeight: tapMin, justifyContent: 'center' },
  // Chip lọc (không phải chip trạng thái việc — those are gone, xem tasks/TaskRow.tsx C8)
  // đang chọn dùng --color-primary-container, KHÔNG dùng secondary-container mặc định của
  // react-native-paper vì tông đó đã có nghĩa riêng: nhãn "Đã nhận" trong dòng phụ hàng việc.
  chipSelected: { backgroundColor: colors.primaryContainer },
  chipSelectedText: { color: colors.onPrimaryContainer, fontWeight: '700' },
  chipTextUnselected: { color: colors.onSurface },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm },
});
