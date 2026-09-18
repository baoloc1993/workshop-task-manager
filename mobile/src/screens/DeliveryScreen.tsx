import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Chip, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { OrderListItem, Route } from '../api/types';
import { colors, fontSize, shape, space } from '../theme/tokens';

// S23 "Hàng trả" (CAP-DEM-05, AC-23) — chọn khu vực + ngày → mọi đơn hẹn trả khu vực đó,
// tô đỏ đơn CHƯA nhồi (status != cho_tra/da_tra). "Chốt chuyến" hàng loạt KHÔNG dựng —
// không AC/endpoint nào yêu cầu; chạm thẻ → S19 để báo trả TỪNG đơn là đủ (ROADMAP.md §3
// nếu pilot cho thấy cần gộp chuyến).
const DAY_FILTERS = ['today', 'tomorrow', 'week'] as const;
type DayFilter = (typeof DAY_FILTERS)[number];
const DAY_LABEL: Record<DayFilter, string> = { today: 'Hôm nay', tomorrow: 'Mai', week: 'Cả tuần' };

function inRange(dueAt: string, filter: DayFilter): boolean {
  const due = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (filter === 'today') return diffDays <= 0;
  if (filter === 'tomorrow') return diffDays <= 1;
  return diffDays <= 7;
}

export function DeliveryScreen({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [areaId, setAreaId] = useState<string | 'all'>('all');
  const [day, setDay] = useState<DayFilter>('today');

  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([api.get<OrderListItem[]>('/orders'), api.get<Route[]>('/routes')]);
      setOrders(o);
      setRoutes(r);
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

  const filtered = useMemo(() => {
    const list = orders ?? [];
    return list.filter((o) => {
      if (o.status === 'moi') return false; // chưa vào chặng nào — chưa tính là "hàng hẹn trả"
      if (!inRange(o.dueAt, day)) return false;
      if (areaId === 'all') return true;
      return areaId === 'xe_om' ? !o.route : o.route?.id === areaId;
    });
  }, [orders, areaId, day]);

  const areas: { id: string | 'all'; name: string; count: number }[] = [
    { id: 'all', name: 'Tất cả', count: orders?.length ?? 0 },
    ...routes.map((r) => ({ id: r.id, name: r.name, count: (orders ?? []).filter((o) => o.route?.id === r.id).length })),
    { id: 'xe_om', name: 'Xe ôm chuyến lẻ', count: (orders ?? []).filter((o) => !o.route).length },
  ];

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={filtered}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        error ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Không có hàng hẹn trả trong khoảng đã chọn.
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
          <View style={styles.chipRow}>
            {areas.map((a) => (
              <Chip key={a.id} selected={areaId === a.id} onPress={() => setAreaId(a.id)} style={styles.chip}>
                {a.name} ({a.count})
              </Chip>
            ))}
          </View>
          <View style={styles.chipRow}>
            {DAY_FILTERS.map((f) => (
              <Chip key={f} selected={day === f} onPress={() => setDay(f)} style={styles.chip}>
                {DAY_LABEL[f]}
              </Chip>
            ))}
          </View>
        </>
      }
      renderItem={({ item }) => {
        const notReady = item.status !== 'cho_tra' && item.status !== 'da_tra';
        return (
          <Pressable style={[styles.row, notReady && styles.rowStuck]} onPress={() => onOpenOrder(item.id)}>
            <Text style={styles.title}>{item.customer.name} — {item.description}</Text>
            <Text style={[styles.subtitle, notReady && styles.subtitleStuck]}>
              {notReady ? 'Chưa xong — chuyến chiều sẽ thiếu' : item.status === 'da_tra' ? 'Đã trả hàng' : 'Sẵn sàng lên xe'}
            </Text>
          </Pressable>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  chip: { marginBottom: space.xs },
  row: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    padding: space.md,
    marginBottom: 3,
  },
  rowStuck: { borderWidth: 1, borderColor: colors.error },
  title: { fontSize: fontSize.body, color: colors.onSurface },
  subtitle: { fontSize: fontSize.label, color: colors.onSurfaceVariant, marginTop: 2 },
  subtitleStuck: { color: colors.error, fontWeight: '700' },
});
