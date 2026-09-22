// C14 hàng mục ở trang chủ S0 — tách từ OwnerMenuScreen ở vòng 9 để S0 của điều phối
// (BatMenuScreen, AC-39) dùng đúng một khuôn với S0 chủ xưởng.
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';

// C14 (DESIGN-SYSTEM.md §4) — mỗi hàng: ICON MÀU · tên · số đếm. Ký tự và lớp màu lấy
// đúng của prototype S0 (`.li.sun/.warn/.ok/.pri/.cfg .ic`), không map sang icon font:
// bộ ký tự này đã là thứ Authority xem và chốt, đổi sang MaterialCommunityIcons là dựng lại
// một lần nữa cái đã chốt. §4b luật 1 "không icon đứng một mình" vẫn đúng — icon nào cũng
// có chữ ngay cạnh.
const ICON_COLOR = {
  sun: colors.secondary,
  warn: colors.error,
  ok: colors.tertiary,
  pri: colors.primary,
  cfg: colors.onSurfaceVariant,
} as const;

export function MenuRow({
  icon,
  tone,
  label,
  count,
  onPress,
}: {
  icon: string;
  tone: keyof typeof ICON_COLOR;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text style={[styles.rowIcon, { color: ICON_COLOR[tone] }]}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      {/* C14 trạng thái bắt buộc: "mục 0 (KHÔNG hiện số)" — kiểm thử 2026-09-19 */}
      {count !== undefined && count > 0 && <Text style={styles.rowCount}>{count}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // prototype `.li`: `background:none` — hàng menu NẰM THẲNG trên nền màn hình, không phải
  // thẻ trắng. Nền trắng + bóng là khuôn C3 (hàng VIỆC), khác khuôn C14 (mục ở trang chủ);
  // dùng nhầm C3 ở đây làm S0 trông như một danh sách việc.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: tapMin,
    borderRadius: shape.small,
    // picky 2026-09-19: lề trái đo được 23.2dp, lệch khỏi avatar/ô tìm (16dp) và không nằm
    // trên thang §2.3. Về đúng --space-md để mọi thứ trên S0 thẳng một đường.
    paddingHorizontal: space.md,
  },
  rowPressed: { backgroundColor: colors.surfaceContainerHigh },
  rowIcon: { width: 24, textAlign: 'center', fontSize: 18 },
  rowLabel: { flex: 1, fontSize: fontSize.body, color: colors.onSurface },
  rowCount: { fontSize: fontSize.label, color: colors.onSurfaceVariant },
});
