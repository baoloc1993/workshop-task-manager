import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Chip, Snackbar, Text } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { SkeletonCard } from '../common/SkeletonCard';
import { api } from '../api/client';
import type { WorkerGroup, WorkerListItem } from '../api/types';
import { chipHitSlop, colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { GROUP_LABEL } from '../orders/orderStatus';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

const ALL_GROUPS: WorkerGroup[] = ['do', 'may', 'cat_mut', 'khau_lot', 'nhoi', 'theu'];

// S26 "Phân vai thợ" (CAP-DEM-07, AC-21) — một người nhiều nhóm, đổi hiệu lực NGAY. Cảnh
// báo nhóm 0 người (việc sẽ không ai nhận được).
export function AssignGroupsScreen() {
  const [workers, setWorkers] = useState<WorkerListItem[] | null>(null);
  // AC-41 (vòng 9) — người được tự ghi việc: thợ may vá/bạt + điều phối (bat_coordinator).
  // Thợ mảng đệm không tự ghi việc được (API 400) nên không có công tắc.
  const [selfLoggers, setSelfLoggers] = useState<WorkerListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [autoError, setAutoError] = useState<{ text: string; person: WorkerListItem } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<WorkerListItem[]>('/users')
      .then((w) => {
        setWorkers(w.filter((u) => u.role === 'worker'));
        setSelfLoggers(w.filter((u) => (u.role === 'worker' && u.line !== 'dem') || u.role === 'bat_coordinator'));
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  // Hiệu lực NGAY, lạc quan: đổi chip trước, lỗi thì trả về giá trị cũ + báo (không tải lại
  // cả màn để khỏi nháy mất vị trí đang cuộn).
  async function toggleAutoApprove(person: WorkerListItem) {
    const next = !person.autoApprove;
    const setFlag = (v: boolean) =>
      setSelfLoggers((prev) => (prev ?? []).map((u) => (u.id === person.id ? { ...u, autoApprove: v } : u)));
    // dogfood vòng 9 (edge): mất mạng thì báo lỗi tới sau 3–5 giây; trong lúc đó chip phải KHOÁ
    // (khỏi bấm lại) và lỗi hiện bằng Snackbar — banner chèn giữa danh sách đẩy hàng xuống
    // ~380px, lượt bấm lại trúng nhầm người khác.
    setFlag(next);
    setAutoError(null);
    setSavingId(person.id);
    try {
      await api.patch(`/users/${person.id}/auto-approve`, { autoApprove: next });
    } catch {
      setFlag(!next);
      setAutoError({ text: `Chưa đổi được "Tự duyệt" của ${person.name}.`, person: { ...person, autoApprove: !next } });
    } finally {
      setSavingId(null);
    }
  }

  useFocusEffect(load);

  // AC-36 (picky 2026-09-19) — `workers === null` = chưa tải xong: KHÔNG tính nhóm trống / "chưa có thợ"
  // (trước đây khuôn rỗng + cảnh báo giả chớp ra khi đang tải).
  const loaded = workers !== null;
  const emptyGroups = !loaded ? [] : ALL_GROUPS.filter((g) => !workers.some((w) => (w.groups ?? []).includes(g)));

  async function toggle(worker: WorkerListItem, group: WorkerGroup) {
    const current = worker.groups ?? [];
    const next = current.includes(group) ? current.filter((g) => g !== group) : [...current, group];
    setWorkers((prev) => (prev ?? []).map((w) => (w.id === worker.id ? { ...w, groups: next } : w)));
    await api.patch(`/users/${worker.id}/groups`, { groups: next }).catch(load);
  }

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <ScreenTitle>Phân vai thợ</ScreenTitle>
      {error && (
        <Banner visible icon={ErrorIcon} style={styles.banner} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: load }]}>
          Mất kết nối — đang thử lại
        </Banner>
      )}
      {emptyGroups.length > 0 && (
        <Banner visible icon={ErrorIcon} style={styles.warnBanner}>
          {emptyGroups.map((g) => GROUP_LABEL[g]).join(', ')} chưa có ai — việc thuộc nhóm này sẽ không ai nhận được.
        </Banner>
      )}
      {!loaded && !error && <SkeletonCard />}
      {loaded && workers.length === 0 && !error && (
        <Text variant="bodyLarge" style={styles.emptyText}>
          Chưa có thợ nào.
        </Text>
      )}
      {(workers ?? []).map((w) => (
        <View key={w.id} style={styles.row}>
          <Text variant="titleLarge">{w.name}</Text>
          <View style={styles.chipRow}>
            {ALL_GROUPS.map((g) => {
              const selected = (w.groups ?? []).includes(g);
              return (
                // C18 — dogfood pha I vòng 7: ép màu bật/tắt tường minh,
                // không dựa vào mặc định Paper (xem CreateOrderScreen cùng lượt sửa).
                <Chip
                  key={g}
                  selected={selected}
                  onPress={() => toggle(w, g)}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                  textStyle={selected ? styles.chipTextSelected : styles.chipTextUnselected}
                  selectedColor={selected ? colors.onPrimaryContainer : colors.onSurface}
                  hitSlop={chipHitSlop}
                >
                  {GROUP_LABEL[g]}
                </Chip>
              );
            })}
          </View>
        </View>
      ))}

      {/* AC-41 (vòng 9) — prototype S26: khối riêng "Việc thợ tự ghi", mỗi người một chip C18
          "Tự duyệt" (mặc định tắt). */}
      {selfLoggers && selfLoggers.length > 0 && (
        <>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            Việc thợ tự ghi
          </Text>
          <Text variant="bodyLarge" style={styles.sectionHint}>
            Bật "Tự duyệt" thì việc người đó tự ghi vào thẳng danh sách. Tắt thì bạn duyệt ở "Việc chờ duyệt".
          </Text>
          {selfLoggers.map((u) => {
            const on = !!u.autoApprove;
            return (
              <View key={u.id} style={[styles.row, styles.autoRow]}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleLarge">{u.name}</Text>
                  <Text style={styles.autoSub}>
                    {u.role === 'bat_coordinator' ? 'Điều phối bạt' : u.line === 'bat' ? 'Bạt' : 'May vá'}
                  </Text>
                </View>
                <Chip
                  selected={on}
                  disabled={savingId === u.id}
                  onPress={() => toggleAutoApprove(u)}
                  style={[styles.chip, on ? styles.chipSelected : styles.chipUnselected]}
                  textStyle={on ? styles.chipTextSelected : styles.chipTextUnselected}
                  selectedColor={on ? colors.onPrimaryContainer : colors.onSurface}
                  hitSlop={chipHitSlop}
                  accessibilityLabel={`Tự duyệt việc ${u.name} tự ghi: ${on ? 'đang bật' : 'đang tắt'}`}
                >
                  Tự duyệt
                </Chip>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
    <Snackbar
      visible={autoError !== null}
      onDismiss={() => setAutoError(null)}
      duration={5000}
      action={autoError ? { label: 'Thử lại', onPress: () => toggleAutoApprove(autoError.person) } : undefined}
    >
      {autoError?.text ?? ''}
    </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  warnBanner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant, marginTop: space.lg },
  row: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small, padding: space.md, marginBottom: space.md, gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // AC-34 (vòng 8) — 48px (--tap-min), trước ghi nhầm 40px, xem CreateOrderScreen.
  chip: { marginBottom: space.xs, minHeight: tapMin, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primaryContainer, borderWidth: 0 },
  chipUnselected: { backgroundColor: 'transparent', borderColor: colors.outline, borderWidth: 1 },
  chipTextSelected: { color: colors.onPrimaryContainer },
  chipTextUnselected: { color: colors.onSurface },
  sectionTitle: { marginTop: space.md, marginBottom: space.xs },
  sectionHint: { color: colors.onSurfaceVariant, marginBottom: space.md },
  autoRow: { flexDirection: 'row', alignItems: 'center' },
  autoSub: { color: colors.onSurfaceVariant, fontSize: fontSize.label },
});
