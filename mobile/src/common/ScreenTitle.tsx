import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, fontSize, space } from '../theme/tokens';

/**
 * Tiêu đề trong THÂN màn, cho các màn dùng thanh mảnh C13(b).
 *
 * Lý do tồn tại (STATE.md §Challenge log 2026-09-19): trong prototype, vụn đường dẫn trên
 * thanh mảnh để `--text-label` 14px — nhưng mọi màn thin-bar của prototype đều mang tiêu đề
 * thật trong thân (`.dtitle`). Ở app có 8 màn không có dòng nào như vậy; nếu để 14px làm
 * tiêu đề duy nhất là trái `DESIGN-SYSTEM.md §1` ràng buộc (1) "chủ xưởng 55 tuổi, lão thị".
 * Vậy nên bổ sung tiêu đề thân ở `--text-title`, KHÔNG phóng to vụn đường dẫn.
 */
export function ScreenTitle({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.title,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: space.sm,
  },
});
