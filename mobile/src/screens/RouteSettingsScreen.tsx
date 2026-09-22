import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, Text, TextInput } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { api } from '../api/client';
import type { Route } from '../api/types';
import { chipHitSlop, colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

// S25 "Khu vực trả hàng" (CAP-DEM-05, AC-23) — cấu hình 4-7 khu vực, chip địa danh (C18)
// bật/tắt có hiệu lực NGAY, không nút "Lưu" riêng.
export function RouteSettingsScreen() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [error, setError] = useState(false);
  const [newName, setNewName] = useState('');
  const [landmarkDrafts, setLandmarkDrafts] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api
      .get<Route[]>('/routes')
      .then((r) => {
        setRoutes(r);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useFocusEffect(load);

  async function addRoute() {
    if (!newName.trim()) return;
    try {
      await api.post('/routes', { name: newName.trim() });
      setNewName('');
      load();
    } catch {
      setError(true);
    }
  }

  async function toggleActive(r: Route) {
    setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
    await api.patch(`/routes/${r.id}`, { active: !r.active }).catch(load);
  }

  async function addLandmark(r: Route) {
    const lm = (landmarkDrafts[r.id] ?? '').trim();
    if (!lm) return;
    const landmarks = [...r.landmarks, lm];
    setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, landmarks } : x)));
    setLandmarkDrafts((d) => ({ ...d, [r.id]: '' }));
    await api.patch(`/routes/${r.id}`, { landmarks }).catch(() => load());
  }

  async function removeLandmark(r: Route, lm: string) {
    const landmarks = r.landmarks.filter((x) => x !== lm);
    setRoutes((prev) => prev.map((x) => (x.id === r.id ? { ...x, landmarks } : x)));
    await api.patch(`/routes/${r.id}`, { landmarks }).catch(() => load());
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }} keyboardShouldPersistTaps="handled">
      <ScreenTitle>Khu vực trả hàng</ScreenTitle>
      {error && (
        <Banner visible icon={ErrorIcon} style={styles.banner} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: load }]}>
          Mất kết nối — đang thử lại
        </Banner>
      )}
      {/* AC-45 (vòng 9, feedback B5) — "khu vực" và "địa danh" là hai thứ khác nghĩa, không
          gộp (DECISIONS.md 2026-09-22): nói rõ bằng chữ ngay đầu màn. */}
      <Text variant="bodyLarge" style={styles.explain}>
        Khu vực = một chuyến xe. Địa danh = tên làng/xã thuộc khu vực đó — app dò địa chỉ khách để gợi ý khu vực.
      </Text>
      <Text variant="bodyLarge" style={styles.hint}>
        Xe ôm chuyến lẻ · Khách tự lấy luôn có sẵn, không cần cấu hình.
      </Text>
      {routes.map((r) => (
        <View key={r.id} style={styles.block}>
          <View style={styles.blockHeader}>
            <Text variant="titleLarge">{r.name}</Text>
            {/* C18 (DESIGN-SYSTEM.md §4) — dogfood pha I vòng 7: màu
                mặc định của Paper không phân biệt rõ bật/tắt, ép màu + chiều cao tường minh. */}
            <Chip
              selected={r.active}
              onPress={() => toggleActive(r)}
              style={r.active ? styles.chipSelected : styles.chipUnselected}
              textStyle={r.active ? styles.chipTextSelected : styles.chipTextUnselected}
              selectedColor={r.active ? colors.onPrimaryContainer : colors.onSurface}
              hitSlop={chipHitSlop}
            >
              {r.active ? 'Đang dùng' : 'Đã tắt'}
            </Chip>
          </View>
          <View style={styles.chipRow}>
            {r.landmarks.map((lm) => (
              <Chip key={lm} onClose={() => removeLandmark(r, lm)} style={styles.chip} hitSlop={chipHitSlop}>
                {lm}
              </Chip>
            ))}
          </View>
          {/* AC-45 — chữ mới dài hơn chữ cũ: nhãn đặt TRÊN ô (C2 "nhãn nhỏ phía trên"), ô
              rộng cả hàng, nút "Thêm" xuống dòng dưới — không để chữ bị cắt ở máy 360dp. */}
          <Text style={styles.addLabel}>＋ Thêm tên làng/xã thuộc khu vực này</Text>
          <TextInput
            mode="outlined"
            placeholder="Ví dụ: Khu A, Khu B"
            accessibilityLabel="Thêm tên làng/xã thuộc khu vực này"
            value={landmarkDrafts[r.id] ?? ''}
            onChangeText={(v) => setLandmarkDrafts((d) => ({ ...d, [r.id]: v }))}
            onSubmitEditing={() => addLandmark(r)}
          />
          <Button
            mode="outlined"
            onPress={() => addLandmark(r)}
            contentStyle={{ height: tapMin }}
            style={[styles.actionButton, styles.addLandmarkButton]}
          >
            Thêm
          </Button>
        </View>
      ))}

      <View style={styles.addRow}>
        <TextInput
          mode="outlined"
          label="Tên khu vực mới"
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={addRoute}
          style={styles.addInput}
        />
        <Button mode="contained" onPress={addRoute} contentStyle={{ height: tapMin }} style={styles.actionButton}>
          Thêm khu vực
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  hint: { color: colors.onSurfaceVariant, marginBottom: space.md },
  explain: { color: colors.onSurface, marginBottom: space.sm },
  // picky vòng 9 (L16): chữ primary trông như lối bấm trong khi đây chỉ là nhãn ô nhập (C2 "nhãn nhỏ
  // phía trên") — về màu nhãn C2.
  addLabel: { fontSize: fontSize.label, color: colors.onSurfaceVariant, marginTop: space.xs },
  addLandmarkButton: { alignSelf: 'flex-start' },
  block: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small, padding: space.md, marginBottom: space.md, gap: space.sm },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // AC-34 (vòng 8, CAP-BUG-01) — DECISIONS.md 2026-09-19 điểm (2): mọi chip là "thứ bấm
  // được" theo §2.3, ép `--tap-min` 48px đồng loạt (trước ép nhầm 40px).
  chip: { marginBottom: space.xs, minHeight: tapMin, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primaryContainer, borderWidth: 0, minHeight: tapMin, justifyContent: 'center' },
  chipUnselected: { backgroundColor: 'transparent', borderColor: colors.outline, borderWidth: 1, minHeight: tapMin, justifyContent: 'center' },
  chipTextSelected: { color: colors.onPrimaryContainer },
  chipTextUnselected: { color: colors.onSurface },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  addInput: { flex: 1 },
  // C1 (vòng 8, AC-27) — Button mặc định của react-native-paper bo viên thuốc; ép
  // `--shape-small` như mọi nút chính khác trong app.
  actionButton: { borderRadius: shape.small },
});
