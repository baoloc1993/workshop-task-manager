import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { api } from '../api/client';
import type { OrderListItem, Task } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { isDoneToday, taskBucket } from '../tasks/taskStatus';
import { ScreenHeader } from '../common/ScreenHeader';

function MenuRow({
  label,
  count,
  onPress,
}: {
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {count !== undefined && <Text style={styles.rowCount}>{count}</Text>}
    </Pressable>
  );
}

// S0 "Trang chủ" (PROTOTYPE.md §1, DECISIONS.md 2026-09-15: trì hoãn tới khi đủ 3 mảng để
// IA có ý nghĩa thật — vòng 7 mở mảng đệm là mảng thứ 3, điều kiện đó nay đã đủ). Không
// dựng lại nguyên bản S0 của prototype (avatar/ô tìm kiếm) — chỉ phần cốt lõi phân biệt
// nó khỏi S1 cũ: MỘT trang gom lối vào theo mảng + cấu hình, thay vì 10 nút chữ nối đuôi
// cuối danh sách việc như trước.
export function OwnerMenuScreen({
  onOverview,
  onPriority,
  onDelivery,
  onCustomerLookup,
  onBatQueue,
  onOrders,
  onHistory,
  onIssueQr,
  onDevices,
  onRouteSettings,
  onAssignGroups,
  onFeedback,
}: {
  onOverview: () => void;
  onPriority: () => void;
  onDelivery: () => void;
  onCustomerLookup: () => void;
  onBatQueue: () => void;
  onOrders: () => void;
  onHistory: () => void;
  onIssueQr: () => void;
  onDevices: () => void;
  onRouteSettings: () => void;
  onAssignGroups: () => void;
  onFeedback: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([api.get<Task[]>('/tasks'), api.get<OrderListItem[]>('/orders')]);
      setTasks(t);
      setOrders(o);
    } catch {
      // S0 chỉ là lối vào — số đếm là tiện ích, không phải dữ liệu quyết định. Màn đích
      // (Cả xưởng hôm nay, Đơn đệm...) đã có khuôn lỗi riêng của chính nó khi tải thật.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = (tasks ?? []).filter((t) => t.status !== 'done');
  const overdueOrStale = active.filter((t) => taskBucket(t) === 'overdueOrStale').length;
  const doneToday = (tasks ?? []).filter((t) => t.status === 'done' && isDoneToday(t)).length;
  const mayVaCount = active.filter((t) => t.line === 'may_va').length;
  const batCount = active.filter((t) => t.line === 'bat').length;
  const demOrderCount = (orders ?? []).filter((o) => o.status !== 'da_tra').length;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Cả xưởng" subtitle="Chủ xưởng" />
      <ScrollView contentContainerStyle={styles.body}>
        <MenuRow label="Cả xưởng hôm nay" count={tasks ? active.length : undefined} onPress={onOverview} />
        <MenuRow label="Việc nào làm trước" count={tasks ? overdueOrStale : undefined} onPress={onPriority} />
        <MenuRow label="Hàng trả theo khu vực" onPress={onDelivery} />
        <MenuRow label="Tra khách cũ" onPress={onCustomerLookup} />
        <View style={styles.divider} />
        <MenuRow label="Việc may vá" count={tasks ? mayVaCount : undefined} onPress={onOverview} />
        <MenuRow label="Việc bạt" count={tasks ? batCount : undefined} onPress={onBatQueue} />
        <MenuRow label="Đơn đệm" count={orders ? demOrderCount : undefined} onPress={onOrders} />
        <MenuRow label="Việc đã xong" count={tasks ? doneToday : undefined} onPress={onHistory} />
        <MenuRow label="Cho người mới vào app" onPress={onIssueQr} />
        <MenuRow label="Máy của thợ" onPress={onDevices} />
        <MenuRow label="Khu vực trả hàng" onPress={onRouteSettings} />
        <MenuRow label="Phân vai thợ" onPress={onAssignGroups} />
        <View style={styles.divider} />
        <MenuRow label="Góp ý" onPress={onFeedback} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { padding: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: tapMin,
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    paddingHorizontal: space.md,
    marginBottom: 3,
  },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  rowLabel: { fontSize: fontSize.body, color: colors.onSurface },
  rowCount: { fontSize: fontSize.label, color: colors.onSurfaceVariant },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: space.sm },
});
