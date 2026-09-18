import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Chip, Text } from 'react-native-paper';
import { api } from '../api/client';
import type { WorkerGroup, WorkerListItem } from '../api/types';
import { colors, shape, space } from '../theme/tokens';
import { GROUP_LABEL } from '../orders/orderStatus';

const ALL_GROUPS: WorkerGroup[] = ['do', 'may', 'cat_mut', 'khau_lot', 'nhoi', 'theu'];

// S26 "Phân vai thợ" (CAP-DEM-07, AC-21) — một người nhiều nhóm, đổi hiệu lực NGAY. Cảnh
// báo nhóm 0 người (việc sẽ không ai nhận được).
export function AssignGroupsScreen() {
  const [workers, setWorkers] = useState<WorkerListItem[]>([]);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api
      .get<WorkerListItem[]>('/users')
      .then((w) => {
        setWorkers(w.filter((u) => u.role === 'worker'));
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useFocusEffect(load);

  const emptyGroups = ALL_GROUPS.filter((g) => !workers.some((w) => (w.groups ?? []).includes(g)));

  async function toggle(worker: WorkerListItem, group: WorkerGroup) {
    const current = worker.groups ?? [];
    const next = current.includes(group) ? current.filter((g) => g !== group) : [...current, group];
    setWorkers((prev) => prev.map((w) => (w.id === worker.id ? { ...w, groups: next } : w)));
    await api.patch(`/users/${worker.id}/groups`, { groups: next }).catch(load);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {error && (
        <Banner visible icon="alert-circle" style={styles.banner} actions={[{ label: 'Thử lại', onPress: load }]}>
          Mất kết nối — đang thử lại
        </Banner>
      )}
      {emptyGroups.length > 0 && (
        <Banner visible icon="alert-circle" style={styles.warnBanner}>
          {emptyGroups.map((g) => GROUP_LABEL[g]).join(', ')} chưa có ai — việc thuộc nhóm này sẽ không ai nhận được.
        </Banner>
      )}
      {workers.length === 0 && !error && (
        <Text variant="bodyLarge" style={styles.emptyText}>
          Chưa có thợ nào.
        </Text>
      )}
      {workers.map((w) => (
        <View key={w.id} style={styles.row}>
          <Text variant="titleLarge">{w.name}</Text>
          <View style={styles.chipRow}>
            {ALL_GROUPS.map((g) => (
              <Chip key={g} selected={(w.groups ?? []).includes(g)} onPress={() => toggle(w, g)} style={styles.chip}>
                {GROUP_LABEL[g]}
              </Chip>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  warnBanner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant, marginTop: space.lg },
  row: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small, padding: space.md, marginBottom: space.md, gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { marginBottom: space.xs },
});
