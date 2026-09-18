import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { OrderDetail } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { STEP_LABEL, formatMeasurements, formatMoney, modeLabel, pillowSummary, remaining } from '../orders/orderStatus';
import { statusLabel } from '../tasks/taskStatus';

// S19 "Chi tiết đơn" — CHỈ owner (PROTOTYPE.md §1). Nơi DUY NHẤT hiện giá/cọc/còn lại (C19).
export function OrderDetailScreen({
  orderId,
  onOpenTask,
  onCutDone,
  onMarkDelivered,
}: {
  orderId: string;
  onOpenTask: (taskId: string) => void;
  onCutDone: () => void;
  onMarkDelivered: () => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);

  const load = useCallback(() => {
    api
      .get<OrderDetail>(`/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        setError(false);
      })
      .catch(() => setError(true));
  }, [orderId]);

  useFocusEffect(load);

  const doTask = order?.tasks.find((t) => t.step === 'do');
  const canCutDone = order && doTask?.status === 'done' && order.tasks.length === 1;

  async function handleDeliver() {
    setDelivering(true);
    setDeliverError(null);
    try {
      await api.post(`/orders/${orderId}/delivered`);
      onMarkDelivered();
    } catch (e) {
      setDeliverError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setDelivering(false);
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Banner visible icon="alert-circle" style={styles.banner} actions={[{ label: 'Thử lại', onPress: load }]}>
          Không tải được đơn này.
        </Banner>
      </View>
    );
  }

  if (!order) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {deliverError && (
        <Banner visible icon="alert-circle" style={styles.banner}>
          {deliverError}
        </Banner>
      )}
      {modeLabel(order.mode) && <Text style={styles.buonTag}>{modeLabel(order.mode)}</Text>}
      <Text variant="titleLarge" style={styles.title}>
        {order.customer.name} — {order.description}
      </Text>
      <Text variant="bodyLarge" style={styles.meta}>
        {order.customer.address}
        {order.route ? ` · ${order.route.name}` : ' · Xe ôm chuyến lẻ'}
      </Text>
      <Text variant="bodyLarge" style={styles.meta}>
        SĐT {order.customer.phone} · Hẹn trả {new Date(order.dueAt).toLocaleDateString('vi-VN')}
        {order.difficulty === 'kho' ? ' · Bộ khó' : ''}
      </Text>

      {formatMeasurements(order) && (
        <Text variant="headlineSmall" style={styles.measurements}>
          {formatMeasurements(order)}
        </Text>
      )}
      {order.measurementPhoto && <Image source={{ uri: order.measurementPhoto }} style={styles.photo} />}
      {pillowSummary(order.pillows) && (
        <Text variant="bodyLarge" style={styles.meta}>
          Gối kèm: {pillowSummary(order.pillows)}
        </Text>
      )}

      {/* C19 — khối tiền, DUY NHẤT ở màn này (không bao giờ ở màn vai worker). */}
      <View style={styles.moneyBlock}>
        <View style={styles.moneyCol}>
          <Text style={styles.moneyLabel}>Giá</Text>
          <Text style={styles.moneyValue}>{formatMoney(order.price)}</Text>
        </View>
        <View style={styles.moneyCol}>
          <Text style={styles.moneyLabel}>Đã cọc</Text>
          <Text style={styles.moneyValue}>{formatMoney(order.deposit)}</Text>
        </View>
        <View style={styles.moneyCol}>
          <Text style={styles.moneyLabel}>Còn lại</Text>
          <Text style={[styles.moneyValue, styles.moneyRemaining]}>{formatMoney(remaining(order))}</Text>
        </View>
      </View>

      <Text variant="labelLarge" style={styles.sec}>
        Công đoạn
      </Text>
      {order.tasks.map((t) => (
        <Button
          key={t.id}
          mode="outlined"
          onPress={() => onOpenTask(t.id)}
          contentStyle={{ height: tapMin, justifyContent: 'flex-start' }}
          style={styles.taskButton}
        >
          {(t.step ? STEP_LABEL[t.step] : t.content)} — {statusLabel(t.status)}
          {t.assignees.length > 0 ? ` (${t.assignees.map((a) => a.user.name).join(', ')})` : ''}
        </Button>
      ))}

      {canCutDone && (
        <Button mode="contained" onPress={onCutDone} contentStyle={{ height: tapMin }} style={styles.actionButton}>
          Chốt số cắt
        </Button>
      )}
      {order.status === 'cho_tra' && (
        <Button
          mode="contained"
          onPress={handleDeliver}
          loading={delivering}
          disabled={delivering}
          contentStyle={{ height: tapMin }}
          style={styles.actionButton}
        >
          {delivering ? 'Đang gửi…' : `Báo đã trả hàng · thu ${formatMoney(remaining(order))}`}
        </Button>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  buonTag: {
    alignSelf: 'flex-start',
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    marginBottom: space.sm,
  },
  title: { marginBottom: space.sm },
  meta: { color: colors.onSurfaceVariant, marginBottom: space.xs },
  measurements: { color: colors.primary, marginTop: space.md, marginBottom: space.xs },
  photo: { width: '100%', height: 180, borderRadius: shape.small, marginBottom: space.md },
  moneyBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    padding: space.md,
    marginTop: space.md,
  },
  moneyCol: { alignItems: 'center' },
  moneyLabel: { fontSize: fontSize.label, color: colors.onSurfaceVariant },
  moneyValue: { fontSize: 22, fontWeight: '700', color: colors.onSurface },
  moneyRemaining: { color: colors.error },
  sec: { color: colors.onSurfaceVariant, marginTop: space.lg, marginBottom: space.sm },
  taskButton: { borderRadius: shape.small, marginBottom: space.xs },
  actionButton: { borderRadius: shape.small, marginTop: space.md },
});
