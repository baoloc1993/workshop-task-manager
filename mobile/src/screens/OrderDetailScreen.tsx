import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { OrderDetail } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { STEP_LABEL, formatMeasurements, formatMoney, modeLabel, pillowSummary, remaining } from '../orders/orderStatus';
import { StepsRow } from '../tasks/StepsRow';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

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
  const { user } = useAuth();
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
  // AC-24 (vòng 8, CAP-BUG-03) — trước đây "Sửa số đo" chỉ mở được khi Task "đi đo" chưa
  // `done`, tức KHOÁ NGAY sau khi đo xong — sớm hơn ý PRD.md §3 AC-24 ("bất kể Task.status,
  // tới khi Chốt số cắt"). Điều kiện đúng là `order.status === 'moi'` (server chỉ khoá thật
  // ở `cutDone()`, xem orders.service.ts) — không đọc `Task.status` nữa.
  const canEditMeasurements = order && order.status === 'moi' && !!doTask;

  async function handleDeliver() {
    setDelivering(true);
    setDeliverError(null);
    try {
      await api.post(`/orders/${orderId}/delivered`);
      // H3 (PRD.md §6) cho mảng đệm: "hoàn tất luồng lõi" là đơn TRẢ HÀNG, không phải một
      // Task đơn lẻ xong — đây là chỉ số quyết định go/pivot/kill của mảng này ở pilot.
      if (user) track('don_dem_da_tra', user.id, { orderId });
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
        <Banner visible icon={ErrorIcon} style={styles.banner} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: load }]}>
          Không tải được đơn này.
        </Banner>
      </View>
    );
  }

  if (!order) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {deliverError && (
        <Banner visible icon={ErrorIcon} style={styles.banner}>
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
          {/* C19: còn lại > 0 tô error, đã trả đủ (=0) tô tertiary — dogfood pha I vòng 7
              (meta) phát hiện đơn 0đ (chưa nhập giá) hiện đỏ y hệt đơn nợ thật. */}
          <Text style={[styles.moneyValue, remaining(order) > 0 ? styles.moneyRemaining : styles.moneyPaid]}>
            {formatMoney(remaining(order))}
          </Text>
        </View>
      </View>

      <Text variant="labelLarge" style={styles.sec}>
        Công đoạn
      </Text>
      {/* C12 (DESIGN-SYSTEM.md §4) — Steps thật (vòng tròn + tên + ai/khi nào), thay cho
          danh sách <Button mode="outlined"> chồng nhau trước đây (AC-27, vòng 8). */}
      <View style={styles.stepsBlock}>
        {order.tasks.map((t) => (
          <StepsRow key={t.id} task={t} label={t.step ? STEP_LABEL[t.step] : t.content} onPress={() => onOpenTask(t.id)} />
        ))}
      </View>

      {canEditMeasurements && (
        <Button
          mode="outlined"
          onPress={() => onOpenTask(doTask!.id)}
          contentStyle={{ height: tapMin }}
          style={styles.actionButton}
        >
          Sửa số đo
        </Button>
      )}
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
  moneyPaid: { color: colors.tertiary },
  sec: { color: colors.onSurfaceVariant, marginTop: space.lg, marginBottom: space.sm },
  stepsBlock: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    paddingHorizontal: space.sm,
  },
  actionButton: { borderRadius: shape.small, marginTop: space.md },
});
