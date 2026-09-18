import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { api } from '../api/client';
import type { Customer } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { formatMeasurements } from '../orders/orderStatus';
import type { CreateOrderPrefill } from './CreateOrderScreen';

// S21 "Tra khách cũ" (CAP-DEM-02, AC-19) — tìm số đo năm ngoái theo SĐT/tên thay sổ giấy
// ~1.000 bộ/năm. "Dùng lại số đo này cho đơn mới" chép SANG đơn mới (ARCHITECTURE.md §6).
export function CustomerLookupScreen({ onUseMeasurements }: { onUseMeasurements: (prefill: CreateOrderPrefill) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      setResults(await api.get<Customer[]>(`/customers/search?q=${encodeURIComponent(q.trim())}`));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <TextInput
        label="Số điện thoại hoặc tên khách"
        mode="outlined"
        value={q}
        onChangeText={setQ}
        onSubmitEditing={search}
        style={styles.input}
      />
      <Button mode="contained" onPress={search} loading={searching} contentStyle={{ height: tapMin }} style={styles.button}>
        Tìm
      </Button>

      {results !== null && results.length === 0 && (
        <Text variant="bodyLarge" style={styles.emptyText}>
          Không tìm thấy khách nào. Kiểm tra lại số, hoặc ghi đơn mới.
        </Text>
      )}

      {(results ?? []).map((c) => (
        <View key={c.id} style={styles.customerBlock}>
          <Text variant="titleLarge">{c.name}</Text>
          <Text variant="bodyLarge" style={styles.meta}>
            {c.phone} · {c.address}
          </Text>
          {c.orders.map((o) => {
            const measured = formatMeasurements(o);
            return (
              <View key={o.id} style={styles.orderRow}>
                <Text variant="bodyLarge">{o.description}</Text>
                <Text variant="bodySmall" style={styles.meta}>
                  Đo ngày {new Date(o.createdAt).toLocaleDateString('vi-VN')}
                  {measured ? ` · ${measured}` : ' · chưa có số đo'}
                </Text>
                {(measured || o.measurementPhoto) && (
                  <Button
                    mode="outlined"
                    onPress={() =>
                      onUseMeasurements({
                        customer: c,
                        measurements: {
                          length: o.measurementLength,
                          depth: o.measurementDepth,
                          width: o.measurementWidth,
                          thickness: o.measurementThickness,
                          photo: o.measurementPhoto,
                        },
                      })
                    }
                    contentStyle={{ height: tapMin }}
                    style={styles.button}
                  >
                    Dùng lại số đo này cho đơn mới
                  </Button>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  input: { marginBottom: space.md },
  button: { borderRadius: shape.small, marginTop: space.sm },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant, marginTop: space.lg },
  customerBlock: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    padding: space.md,
    marginTop: space.md,
    gap: space.xs,
  },
  meta: { color: colors.onSurfaceVariant },
  orderRow: { marginTop: space.sm, gap: 2 },
});
