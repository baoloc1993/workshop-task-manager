import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { api } from '../api/client';
import type { Customer } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { formatMeasurements } from '../orders/orderStatus';
import type { CreateOrderPrefill } from './CreateOrderScreen';

// S21 "Tra khách cũ" (CAP-DEM-02, AC-19) — tìm số đo năm ngoái theo SĐT/tên thay sổ giấy
// ~1.000 bộ/năm. "Dùng lại số đo này cho đơn mới" chép SANG đơn mới (ARCHITECTURE.md §6).
export function CustomerLookupScreen({ onUseMeasurements }: { onUseMeasurements: (prefill: CreateOrderPrefill) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);
  // AC-28 (vòng 8, CAP-BUG-01) — bấm "Tìm" với ô rỗng trước đây KHÔNG có gì xảy ra (không
  // banner, không viền đỏ) — im lặng vi phạm §4b luật 3 "làm xong phải nói là đã xong"
  // (ở đây là ngược lại: chưa làm gì cũng phải nói vì sao).
  const [emptyError, setEmptyError] = useState(false);

  async function search() {
    if (!q.trim()) {
      setEmptyError(true);
      return;
    }
    setEmptyError(false);
    setSearching(true);
    try {
      setResults(await api.get<Customer[]>(`/customers/search?q=${encodeURIComponent(q.trim())}`));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // dogfood pha I vòng 7: mặc định keyboardShouldPersistTaps="never" của
  // ScrollView khiến lần chạm đầu vào nút "Tìm" (khi bàn phím còn mở) chỉ tắt bàn phím,
  // không kích onPress — người dùng phải chạm 2 lần mới chạy tìm kiếm.
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }} keyboardShouldPersistTaps="handled">
      <ScreenTitle>Tra khách cũ</ScreenTitle>
      {emptyError && (
        <Banner visible icon="alert-circle" style={styles.errorBanner}>
          Nhập số điện thoại hoặc tên khách trước đã.
        </Banner>
      )}
      {/* C2 (DESIGN-SYSTEM.md §4) — dogfood pha I vòng 8: mặc định
          "outlined" của react-native-paper vẽ nền trong suốt + viền `theme.colors.outline`
          (`#8A8886`), lệch hai token của C2 (nền `--color-surface-container` trắng, viền
          `--color-outline-variant`). Mọi ô nhập khác trong app đều dính lỗi tương tự —
          sửa ở đây trước vì đây là màn AC-28 chỉ đích danh; ép tường minh thay vì đợi theme. */}
      <TextInput
        label="Số điện thoại hoặc tên khách"
        mode="outlined"
        value={q}
        onChangeText={(v) => {
          setQ(v);
          if (emptyError) setEmptyError(false);
        }}
        onSubmitEditing={search}
        error={emptyError}
        outlineColor={colors.outlineVariant}
        activeOutlineColor={colors.primary}
        style={[styles.input, styles.inputSurface]}
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
          {/* AC-28 — DESIGN-SYSTEM.md §4d luật 9 "số điện thoại LUÔN bấm gọi được": trước
              đây là Text thường, không có cách nào gọi thẳng từ đây. Chỉ số điện thoại
              (Text lồng) là phần bấm gọi được, địa chỉ vẫn chỉ để đọc. */}
          <Text variant="bodyLarge" style={styles.meta}>
            <Text
              style={styles.phoneLink}
              onPress={() => Linking.openURL(`tel:${c.phone}`)}
              accessibilityRole="link"
            >
              📞 {c.phone}
            </Text>
            {' · '}
            {c.address}
          </Text>
          {c.orders.map((o) => {
            const measured = formatMeasurements(o);
            return (
              <View key={o.id} style={styles.orderRow}>
                <Text variant="bodyLarge">{o.description}</Text>
                {/* AC-28 — picky 2026-09-19 đo được ~13px (`bodySmall` mặc định Paper),
                    dưới thang §2.2 (nhỏ nhất `--text-label` 14px) — ép tường minh. */}
                <Text variant="bodySmall" style={[styles.meta, styles.measuredLine]}>
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
  inputSurface: { backgroundColor: colors.surfaceContainer },
  errorBanner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  button: { borderRadius: shape.small, marginTop: space.sm },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant, marginTop: space.lg },
  phoneLink: { color: colors.primary, fontWeight: '700', fontSize: fontSize.body },
  customerBlock: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    padding: space.md,
    marginTop: space.md,
    gap: space.xs,
  },
  meta: { color: colors.onSurfaceVariant },
  // AC-28 (vòng 8) — `bodySmall` mặc định Paper đo được ~13px, dưới thang §2.2 (nhỏ nhất
  // --text-label 14px) — ép tường minh thay vì dựa vào variant.
  measuredLine: { fontSize: fontSize.label },
  orderRow: { marginTop: space.sm, gap: 2 },
});
