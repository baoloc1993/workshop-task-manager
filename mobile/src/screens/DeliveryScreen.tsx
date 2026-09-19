import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { OrderListItem, Route } from '../api/types';
import { chipHitSlop, colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { SkeletonCard } from '../common/SkeletonCard';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

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

export function DeliveryScreen({
  onOpenOrder,
  onCreateOrder,
}: {
  onOpenOrder: (id: string) => void;
  onCreateOrder: () => void;
}) {
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

  // AC-34 (vòng 8, CAP-BUG-01) — trước đây số đếm `(N)` mỗi chip khu vực tính trên TOÀN BỘ
  // `orders` (bỏ qua chip ngày/trạng thái đang chọn) — chủ xưởng chọn "Mai" nhưng số đếm
  // vẫn hiện như đang xem "Tất cả", lệch hẳn danh sách thật hiện dưới đó. Số đếm phải theo
  // đúng bộ lọc ngày + trạng thái hiện tại (`byDay`), chỉ khác `filtered` ở chỗ CHƯA áp
  // riêng bộ lọc khu vực — mỗi chip khu vực cần đếm trên phần còn lại, không phải trên
  // chính lựa chọn của nó.
  const byDay = useMemo(
    () => (orders ?? []).filter((o) => o.status !== 'moi' && inRange(o.dueAt, day)),
    [orders, day],
  );

  const filtered = useMemo(() => {
    if (areaId === 'all') return byDay;
    return byDay.filter((o) => (areaId === 'xe_om' ? !o.route : o.route?.id === areaId));
  }, [byDay, areaId]);

  const areas: { id: string | 'all'; name: string; count: number }[] = [
    { id: 'all', name: 'Tất cả', count: byDay.length },
    ...routes.map((r) => ({ id: r.id, name: r.name, count: byDay.filter((o) => o.route?.id === r.id).length })),
    { id: 'xe_om', name: 'Xe ôm chuyến lẻ', count: byDay.filter((o) => !o.route).length },
  ];

  // AC-36 (vòng 8, CAP-BUG-01) — trước đây `orders === null` (chưa tải lần đầu) rơi thẳng
  // vào khuôn rỗng bên dưới, chớp qua "Không có hàng hẹn trả" + nút "Ghi đơn mới" trước khi
  // dữ liệu thật tới (DESIGN-SYSTEM.md §5 "Đang tải" đòi khung xám, không phải khuôn rỗng).
  if (orders === null && !error) {
    return (
      <View style={[styles.container, { padding: space.md }]}>
        <SkeletonCard />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={filtered}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        error ? null : (
          // AC-29 (vòng 8, CAP-BUG-01) — khuôn rỗng S23 trước đây chỉ một câu, không nút,
          // khớp C7 đã khai cho màn này (DESIGN-SYSTEM.md §4): đúng MỘT nút "＋ Ghi đơn mới".
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              Không có hàng hẹn trả trong khoảng đã chọn.
            </Text>
            <Button mode="contained" onPress={onCreateOrder} contentStyle={{ height: tapMin }} style={styles.emptyButton}>
              ＋ Ghi đơn mới
            </Button>
          </View>
        )
      }
      ListHeaderComponent={
        <>
          {error && (
            <Banner visible icon={ErrorIcon} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: load }]} style={styles.banner}>
              Mất kết nối — đang thử lại
            </Banner>
          )}
          {/* AC-27 (vòng 8, CAP-BUG-01) — trước đây không ép màu, Paper tô chip "selected"
              bằng secondaryContainer (nhãn BUÔN #FFF4CE/#3D2600) — nhầm token C18 (bật =
              primary-container, tắt = chỉ viền outline-variant), cùng lỗi đã sửa ở
              CreateOrderScreen/RouteSettingsScreen. */}
          <View style={styles.chipRow}>
            {areas.map((a) => (
              <Chip
                key={a.id}
                selected={areaId === a.id}
                onPress={() => setAreaId(a.id)}
                style={[styles.chip, areaId === a.id ? styles.chipSelected : styles.chipUnselected]}
                textStyle={areaId === a.id ? styles.chipTextSelected : styles.chipTextUnselected}
                selectedColor={areaId === a.id ? colors.onPrimaryContainer : colors.onSurface}
                hitSlop={chipHitSlop}
              >
                {a.name} ({a.count})
              </Chip>
            ))}
          </View>
          <View style={styles.chipRow}>
            {DAY_FILTERS.map((f) => (
              <Chip
                key={f}
                selected={day === f}
                onPress={() => setDay(f)}
                style={[styles.chip, day === f ? styles.chipSelected : styles.chipUnselected]}
                textStyle={day === f ? styles.chipTextSelected : styles.chipTextUnselected}
                selectedColor={day === f ? colors.onPrimaryContainer : colors.onSurface}
                hitSlop={chipHitSlop}
              >
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  emptyButton: { borderRadius: shape.small },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  // AC-34 (vòng 8) — chip khu vực/ngày ở S23 chưa từng có minHeight, mặc định Paper ~32dp.
  chip: { marginBottom: space.xs, minHeight: tapMin, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primaryContainer, borderWidth: 0 },
  chipUnselected: { backgroundColor: 'transparent', borderColor: colors.outline, borderWidth: 1 },
  chipTextSelected: { color: colors.onPrimaryContainer },
  chipTextUnselected: { color: colors.onSurface },
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
