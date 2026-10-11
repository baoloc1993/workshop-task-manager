import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space } from '../theme/tokens';
import { useAuth } from '../auth/AuthContext';
import { LogoutMenuRow, MenuRow } from '../common/MenuRow';

// S0 của thợ (vai `worker`)
// Trước đây thợ mở thẳng S6 mà S6 lại có nút ‹ (C13(a) `canGoBack`) — màn
// gốc của stack nên bấm ‹ không đi đâu cả, người mới tưởng app treo. Nay S0 là màn đầu,
// cùng khuôn C14 với S0 chủ xưởng / điều phối (MenuRow), ‹ ở S6 quay về đây.
// Khối mục gộp hai dòng `worker` (may vá/bạt) và `may` (thợ mảng đệm) của bảng prototype:
// "Việc nhóm chờ nhận" chỉ có với thợ mảng đệm. Mục "▦ Quét mã để vào app → S8" không đưa
// vào — thợ đã ở trong app thì quét mã không còn việc gì để làm (S8 nằm ngoài stack này).
export function WorkerMenuScreen({
  isDemWorker,
  onMyTasks,
  onDemQueue,
  onHistory,
  onFeedback,
}: {
  isDemWorker: boolean;
  onMyTasks: () => void;
  onDemQueue: () => void;
  onHistory: () => void;
  onFeedback: () => void;
}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [mineCount, setMineCount] = useState<number | undefined>(undefined);
  const [queueCount, setQueueCount] = useState<number | undefined>(undefined);

  // Số đếm là tiện ích của lối vào (cùng tinh thần S0 chủ xưởng / điều phối): lỗi thì chỉ bỏ số.
  const load = useCallback(() => {
    api
      .get<Task[]>('/tasks/mine')
      .then((t) => setMineCount(t.filter((x) => x.status !== 'done').length))
      .catch(() => setMineCount(undefined));
    if (isDemWorker) {
      api
        .get<Task[]>('/tasks/dem-queue')
        .then((t) => setQueueCount(t.length))
        .catch(() => setQueueCount(undefined));
    }
  }, [isDemWorker]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const initials =
    (user?.name ?? 'Thợ')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'T';

  const sub =
    user?.line === 'bat' ? 'Thợ bạt' : user?.line === 'may_va' ? 'Thợ may vá' : isDemWorker ? 'Thợ mảng đệm' : 'Thợ';

  return (
    <View style={styles.container}>
      {/* đầu S0 là hàng avatar + tên, không phải khối đầu mục C13(a) (xem OwnerMenuScreen). */}
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.topName}>{user?.name ?? 'Thợ'}</Text>
          <Text style={styles.topSub}>{sub}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <MenuRow icon="☀" tone="sun" label="Việc của tôi" count={mineCount} onPress={onMyTasks} />
        <View style={styles.divider} />
        {isDemWorker && (
          <MenuRow icon="▤" tone="pri" label="Việc nhóm chờ nhận" count={queueCount} onPress={onDemQueue} />
        )}
        <MenuRow icon="✓" tone="ok" label="Đã xong tuần này" onPress={onHistory} />
        <View style={styles.divider} />
        <MenuRow icon="✎" tone="cfg" label="Góp ý" onPress={onFeedback} />
        <LogoutMenuRow />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { paddingTop: space.sm, paddingBottom: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingBottom: 6 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: shape.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onPrimary, fontWeight: '700', fontSize: fontSize.label },
  topName: { fontSize: fontSize.body, fontWeight: '600', color: colors.onSurface },
  topSub: { fontSize: fontSize.label, color: colors.onSurfaceVariant },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 6, marginHorizontal: space.md },
});
