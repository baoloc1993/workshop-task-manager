import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Card, Chip, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, space } from '../theme/tokens';
import { formatTime, lineLabel } from '../tasks/taskStatus';

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
              icon="alert-circle"
              actions={[{ label: 'Thử lại', onPress: () => load(range) }]}
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
                style={range === r ? styles.chipSelected : styles.chip}
                textStyle={range === r ? styles.chipSelectedText : undefined}
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
          <Card style={styles.card} onPress={() => onOpenTask(item.id)}>
            <Card.Content style={{ gap: space.xs }}>
              <Text variant="titleLarge" numberOfLines={2}>
                {item.content}
              </Text>
              <Text variant="bodyLarge" style={styles.who}>
                {who} · {lineLabel(item.line)}
                {doneAt ? ` · xong ${new Date(doneAt).toLocaleDateString('vi-VN')} lúc ${formatTime(doneAt)}` : ''}
              </Text>
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
  chips: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  chip: { borderColor: colors.outline },
  // Chip lọc đang chọn dùng đúng tông "tab đang chọn" (DESIGN-SYSTEM.md §4 C14:
  // nền viên thuốc --color-primary-container) — KHÔNG dùng secondary-container mặc định
  // của react-native-paper vì tông đó đã có nghĩa riêng: chip trạng thái việc "Đã nhận".
  chipSelected: { backgroundColor: colors.primaryContainer },
  chipSelectedText: { color: colors.onPrimaryContainer, fontWeight: '700' },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm },
  card: { marginBottom: space.sm, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  who: { color: colors.onSurfaceVariant },
});
