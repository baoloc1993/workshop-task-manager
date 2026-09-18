import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, Text, TextInput } from 'react-native-paper';
import { api } from '../api/client';
import type { Route } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';

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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {error && (
        <Banner visible icon="alert-circle" style={styles.banner} actions={[{ label: 'Thử lại', onPress: load }]}>
          Mất kết nối — đang thử lại
        </Banner>
      )}
      <Text variant="bodyLarge" style={styles.hint}>
        Xe ôm chuyến lẻ · Khách tự lấy luôn có sẵn, không cần cấu hình.
      </Text>
      {routes.map((r) => (
        <View key={r.id} style={styles.block}>
          <View style={styles.blockHeader}>
            <Text variant="titleLarge">{r.name}</Text>
            <Chip selected={r.active} onPress={() => toggleActive(r)}>
              {r.active ? 'Đang dùng' : 'Đã tắt'}
            </Chip>
          </View>
          <View style={styles.chipRow}>
            {r.landmarks.map((lm) => (
              <Chip key={lm} onClose={() => removeLandmark(r, lm)} style={styles.chip}>
                {lm}
              </Chip>
            ))}
          </View>
          <View style={styles.addRow}>
            <TextInput
              mode="outlined"
              placeholder="Thêm địa danh (vd. Khu A, Khu B)"
              value={landmarkDrafts[r.id] ?? ''}
              onChangeText={(v) => setLandmarkDrafts((d) => ({ ...d, [r.id]: v }))}
              onSubmitEditing={() => addLandmark(r)}
              style={styles.addInput}
            />
            <Button mode="outlined" onPress={() => addLandmark(r)} contentStyle={{ height: tapMin }}>
              Thêm
            </Button>
          </View>
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
        <Button mode="contained" onPress={addRoute} contentStyle={{ height: tapMin }}>
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
  block: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small, padding: space.md, marginBottom: space.md, gap: space.sm },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { marginBottom: space.xs },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  addInput: { flex: 1 },
});
