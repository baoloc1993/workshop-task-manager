import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, SectionList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { OrderListItem } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { modeLabel, orderProgress } from '../orders/orderStatus';

function OrderRow({ order, onPress }: { order: OrderListItem; onPress: () => void }) {
  const progress = orderProgress(order);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.dot, progress.stuck && styles.dotStuck]} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          {modeLabel(order.mode) && <Text style={styles.buonTag}>{modeLabel(order.mode)}</Text>}
          <Text style={styles.title} numberOfLines={1}>
            {order.customer.name} — {order.description}
          </Text>
        </View>
        <Text style={[styles.subtitle, progress.stuck && styles.subtitleStuck]} numberOfLines={1}>
          {progress.text} · hẹn {new Date(order.dueAt).toLocaleDateString('vi-VN')}
        </Text>
      </View>
      {progress.stuck && <Text style={styles.star}>★</Text>}
    </Pressable>
  );
}

// S17 — "Đơn đệm" (CAP-DEM-04, AC-20). Sắp trễ/kẹt trước, đang làm sau, chờ trả gấp cuối
// (cùng tinh thần bốn nhóm của S1 — DECISIONS.md vòng 5, tính ở CLIENT bằng hàm thuần).
export function OrderListScreen({
  onOpenOrder,
  onCreateOrder,
}: {
  onOpenOrder: (id: string) => void;
  onCreateOrder: () => void;
}) {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await api.get<OrderListItem[]>('/orders'));
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

  const list = orders ?? [];
  const stuck = list.filter((o) => o.status !== 'da_tra' && orderProgress(o).stuck);
  const active = list.filter((o) => o.status !== 'da_tra' && !orderProgress(o).stuck);
  const delivered = list.filter((o) => o.status === 'da_tra');

  const sections = [
    { key: 'stuck', title: 'Đang kẹt', data: stuck },
    { key: 'active', title: 'Đang làm', data: active },
    { key: 'done', title: `Đã trả hàng (${delivered.length})`, data: delivered },
  ].filter((s) => s.data.length > 0);

  const isEmpty = orders !== null && orders.length === 0;

  return (
    <View style={styles.container}>
      <SectionList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
        sections={sections}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          error || !isEmpty ? null : (
            <View style={styles.empty}>
              <Text variant="bodyLarge" style={styles.emptyText}>
                Chưa có đơn đệm nào.
              </Text>
              <Button mode="contained" onPress={onCreateOrder} contentStyle={{ height: tapMin }} style={styles.button}>
                Ghi đơn đầu tiên
              </Button>
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
        renderItem={({ item }) => <OrderRow order={item} onPress={() => onOpenOrder(item.id)} />}
      />
      {!isEmpty && (
        <View style={styles.addBar}>
          <Button
            mode="text"
            onPress={onCreateOrder}
            style={styles.addBarPrimary}
            contentStyle={{ height: 64 }}
            labelStyle={styles.addBarLabel}
          >
            ＋ Ghi đơn mới
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, gap: space.md },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  button: { borderRadius: shape.small },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: tapMin,
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pressed: { backgroundColor: colors.surfaceContainerHigh },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.primary },
  dotStuck: { borderColor: colors.error },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  buonTag: {
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
  },
  title: { fontSize: fontSize.body, color: colors.onSurface, flexShrink: 1 },
  subtitle: { fontSize: fontSize.label, color: colors.onSurfaceVariant },
  subtitleStuck: { color: colors.error, fontWeight: '700' },
  star: { fontSize: fontSize.title, color: colors.error },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingHorizontal: space.md,
  },
  addBarPrimary: { flex: 1, justifyContent: 'center' },
  addBarLabel: { color: colors.primary, fontWeight: '700' },
});
