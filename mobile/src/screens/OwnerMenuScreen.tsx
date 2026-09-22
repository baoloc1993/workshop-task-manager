import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { api } from '../api/client';
import type { OrderListItem, Task } from '../api/types';
import { colors, fontSize, navHeight, shape, space, tapMin } from '../theme/tokens';
import { isDoneToday, taskBucket } from '../tasks/taskStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { MenuRow } from '../common/MenuRow';

// S0 "Trang chủ" (PROTOTYPE.md §1, DECISIONS.md 2026-09-15: trì hoãn tới khi đủ 3 mảng để
// IA có ý nghĩa thật — vòng 7 mở mảng đệm là mảng thứ 3, điều kiện đó nay đã đủ). Không
// dựng lại nguyên bản S0 của prototype (avatar/ô tìm kiếm) — chỉ phần cốt lõi phân biệt
// nó khỏi S1 cũ: MỘT trang gom lối vào theo mảng + cấu hình, thay vì 10 nút chữ nối đuôi
// cuối danh sách việc như trước.
export function OwnerMenuScreen({
  onOverview,
  onMayVa,
  onPendingTasks,
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
  onVoiceCapture,
}: {
  onOverview: () => void;
  // AC-43 (vòng 9) — trước đây mục "Việc may vá" gọi `onOverview` (lỗi thật, DECISIONS.md
  // 2026-09-22): mở S1 không lọc. Nay mở S1 với chip May vá bật sẵn.
  onMayVa: () => void;
  onPendingTasks: () => void;
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
  onVoiceCapture: () => void;
}) {
  const { user, logout } = useAuth();
  // S0 là màn gốc, không có header nào phía trên — phải tự trừ tai thỏ/thanh trạng thái,
  // nếu không hàng avatar đè lên đồng hồ (tự bấm thấy ngay sau khi bỏ ScreenHeader khỏi S0).
  const insets = useSafeAreaInsets();
  // "CX" trong prototype là viết tắt của "Chủ xưởng" — ở đây lấy chữ đầu của tên thật,
  // tối đa 2 chữ, để mỗi người thấy đúng mình (§4b: không chữ của dân phần mềm, không mã).
  const initials =
    (user?.name ?? 'Chủ xưởng')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'CX';
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  // AC-41 (vòng 9) — số việc chờ duyệt, tải riêng: lỗi (vd API cũ chưa có endpoint) thì
  // chỉ bỏ số, không làm mất số đếm của các mục khác.
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined);

  const load = useCallback(async () => {
    api
      .get<Task[]>('/tasks/pending')
      .then((p) => setPendingCount(p.length))
      .catch(() => setPendingCount(undefined));
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
      {/* C14 (DESIGN-SYSTEM.md §4) — đầu S0 là hàng avatar + tên + tên xưởng rồi ô tìm,
          KHÔNG phải khối đầu mục chuyển sắc: C13(a) chỉ khai cho S1/S6/S9/S16/S17/S22/S23,
          S0 không nằm trong danh sách đó (prototype S0 dùng `.top` + `.search`). */}
      <View style={[styles.top, { paddingTop: insets.top + 14 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.topName}>{user?.name ?? 'Chủ xưởng'}</Text>
          <Text style={styles.topSub}>Xưởng đệm Demo</Text>
        </View>
      </View>
      <Pressable
        onPress={onCustomerLookup}
        style={({ pressed }) => [styles.search, pressed && styles.rowPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.searchText}>🔍  Tìm khách, tìm đơn, tìm việc…</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.body}>
        <MenuRow icon="☀" tone="sun" label="Cả xưởng hôm nay" count={tasks ? active.length : undefined} onPress={onOverview} />
        <MenuRow icon="!" tone="warn" label="Việc nào làm trước" count={tasks ? overdueOrStale : undefined} onPress={onPriority} />
        <MenuRow icon="⏳" tone="sun" label="Việc chờ duyệt" count={pendingCount} onPress={onPendingTasks} />
        <MenuRow icon="🚚" tone="ok" label="Hàng trả theo khu vực" onPress={onDelivery} />
        <MenuRow icon="👤" tone="pri" label="Tra khách cũ" onPress={onCustomerLookup} />
        <View style={styles.divider} />
        <MenuRow icon="▤" tone="sun" label="Việc may vá" count={tasks ? mayVaCount : undefined} onPress={onMayVa} />
        <MenuRow icon="▤" tone="ok" label="Việc bạt" count={tasks ? batCount : undefined} onPress={onBatQueue} />
        <MenuRow icon="▤" tone="pri" label="Đơn đệm" count={orders ? demOrderCount : undefined} onPress={onOrders} />
        <MenuRow icon="✓" tone="ok" label="Việc đã xong" count={tasks ? doneToday : undefined} onPress={onHistory} />
        <MenuRow icon="▦" tone="cfg" label="Cho người mới vào app" onPress={onIssueQr} />
        <MenuRow icon="📱" tone="cfg" label="Máy của thợ" onPress={onDevices} />
        <MenuRow icon="⚙" tone="cfg" label="Khu vực trả hàng" onPress={onRouteSettings} />
        <MenuRow icon="👥" tone="cfg" label="Phân vai thợ" onPress={onAssignGroups} />
        <View style={styles.divider} />
        <MenuRow icon="✎" tone="cfg" label="Góp ý" onPress={onFeedback} />
        {/* AC-31 (vòng 8, CAP-BUG-03) — owner trước đó không có lối nào đăng xuất trong app */}
        <MenuRow icon="⏻" tone="warn" label="Đăng xuất" onPress={() => logout()} />
      </ScrollView>
      {/* C7 — thanh thêm ghim đáy (DESIGN-SYSTEM.md §4; prototype S0 `.addbar`). Thiếu nó thì
          chủ xưởng ở S0 phải vào "Cả xưởng hôm nay" mới giao được việc bằng giọng nói, đội
          ngân sách §4c "giao việc bằng giọng nói ≤3 chạm" lên 4. */}
      {/* picky 2026-09-19: mép dưới thanh nằm dưới vạch cử chỉ Android (đáy y=2369/2400).
          Trừ safe-area đáy, giữ 12px tối thiểu như cũ khi máy không có vạch. */}
      <Pressable
        onPress={onVoiceCapture}
        style={({ pressed }) => [
          styles.addBar,
          { marginBottom: Math.max(insets.bottom, 12) },
          pressed && styles.addBarPressed,
        ]}
        accessibilityRole="button"
      >
        <Text style={styles.addBarPlus}>＋</Text>
        <Text style={styles.addBarLabel}>Nói để giao việc</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { paddingBottom: space.sm },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.md,
    paddingBottom: 6,
  },
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
  search: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: 12,
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    minHeight: tapMin, // picky 2026-09-19: đo được 39.2dp, dưới --tap-min 48 (§2.3)
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  searchText: { color: colors.onSurfaceVariant, fontSize: fontSize.label },
  divider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 6, marginHorizontal: space.md },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: navHeight,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceContainer,
    borderRadius: shape.small,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  addBarPressed: { backgroundColor: colors.surfaceContainerHigh },
  addBarPlus: { fontSize: 22, color: colors.primary },
  addBarLabel: { fontSize: fontSize.body, fontWeight: '600', color: colors.primary },
});
