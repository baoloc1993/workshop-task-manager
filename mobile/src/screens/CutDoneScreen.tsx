import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { OrderDetail } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { formatMeasurements } from '../orders/orderStatus';

// S24 "Tính cắt vải, mút" (CAP-DEM-04, AC-20). CAP-DEM-03 (công thức) đẩy backlog
// (DECISIONS.md vòng 7) — luôn nhập tay, không có gợi ý điền sẵn.
export function CutDoneScreen({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [fabric, setFabric] = useState('');
  const [foam, setFoam] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<OrderDetail>(`/orders/${orderId}`)
      .then((o) => {
        setOrder(o);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [orderId]);

  useFocusEffect(load);

  async function handleSubmit() {
    if (!fabric.trim() || !foam.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.post(`/orders/${orderId}/cut-done`, { fabricMeters: Number(fabric), foamSheets: Number(foam) });
      onDone();
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }} keyboardShouldPersistTaps="handled">
      {sendError && (
        <Banner visible icon="alert-circle" style={styles.banner}>
          {sendError}
        </Banner>
      )}
      <Text variant="titleLarge" style={styles.title}>
        {order.customer.name} — {order.description}
      </Text>
      <Text variant="bodyLarge" style={styles.meta}>
        {order.difficulty === 'kho' ? 'Bộ khó — không có gợi ý, nhập theo kinh nghiệm' : 'Bộ dễ'}
      </Text>
      {formatMeasurements(order) && (
        <Text variant="headlineSmall" style={styles.measurements}>
          {formatMeasurements(order)}
        </Text>
      )}
      <TextInput
        label="Vải (mét)"
        mode="outlined"
        keyboardType="numeric"
        value={fabric}
        onChangeText={setFabric}
        style={styles.input}
      />
      <TextInput
        label="Mút (tấm)"
        mode="outlined"
        keyboardType="numeric"
        value={foam}
        onChangeText={setFoam}
        style={styles.input}
      />
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={sending}
        disabled={sending || !fabric.trim() || !foam.trim()}
        contentStyle={{ height: tapMin }}
        style={styles.button}
      >
        {sending ? 'Đang gửi…' : 'Chốt số cắt — mở việc chặng 2'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  title: { marginBottom: space.sm },
  meta: { color: colors.onSurfaceVariant, marginBottom: space.sm },
  measurements: { color: colors.primary, marginBottom: space.md },
  input: { marginBottom: space.md },
  button: { borderRadius: shape.small },
});
