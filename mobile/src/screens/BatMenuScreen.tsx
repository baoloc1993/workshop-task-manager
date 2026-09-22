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

// S0 của điều phối (vai `bat`, PROTOTYPE.md §1 "Năm khối mục của S0, theo vai") — vòng 9, AC-39.
// Trước vòng 9 điều phối mở thẳng S9 và đi sang "Việc của tôi" bằng nút góc trên; bản đồ vòng 1
// đã có S0 cho vai này nhưng app chưa dựng. Nay điều phối được giao việc ở MỌI mảng (trừ đệm)
// nên "Việc của tôi" thành một lối ngang hàng với "Việc bạt chờ chia", không còn là nút phụ.
// Mục "! Nhắc việc → S11" của prototype chưa dựng: app chưa có màn S11 riêng (push mở thẳng
// app), không thêm mục dẫn tới màn không tồn tại.
export function BatMenuScreen({
  onBatQueue,
  onMyTasks,
  onHistory,
  onFeedback,
}: {
  onBatQueue: () => void;
  onMyTasks: () => void;
  onHistory: () => void;
  onFeedback: () => void;
}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [queueCount, setQueueCount] = useState<number | undefined>(undefined);
  const [mineCount, setMineCount] = useState<number | undefined>(undefined);

  // Số đếm là tiện ích của lối vào (cùng tinh thần S0 chủ xưởng): lỗi thì chỉ bỏ số.
  const load = useCallback(() => {
    api
      .get<Task[]>('/tasks/bat-queue')
      .then((t) => setQueueCount(t.length))
      .catch(() => setQueueCount(undefined));
    api
      .get<Task[]>('/tasks/mine')
      .then((t) => setMineCount(t.filter((x) => x.status !== 'done').length))
      .catch(() => setMineCount(undefined));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const initials =
    (user?.name ?? 'Điều phối')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'L';

  return (
    <View style={styles.container}>
      {/* C14 — đầu S0 là hàng avatar + tên, không phải khối đầu mục C13(a) (xem OwnerMenuScreen). */}
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.topName}>{user?.name ?? 'Điều phối'}</Text>
          <Text style={styles.topSub}>Điều phối nhóm bạt</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <MenuRow icon="☀" tone="sun" label="Việc bạt chờ chia" count={queueCount} onPress={onBatQueue} />
        <View style={styles.divider} />
        <MenuRow icon="▤" tone="pri" label="Việc của tôi" count={mineCount} onPress={onMyTasks} />
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
