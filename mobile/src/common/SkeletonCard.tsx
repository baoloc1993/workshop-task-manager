// AC-36 (vòng 8, CAP-BUG-01) — khuôn "đang tải" (DESIGN-SYSTEM.md §5): khung xám
// --color-surface-container-high giữ đúng chỗ nội dung sắp hiện, cỡ một thẻ — không nhảy
// bố cục, không vòng xoay giữa màn trắng. Dùng chung cho mọi màn danh sách (TaskRow/OrderRow
// đều cao ~--tap-min + padding, một khuôn dùng chung là đủ, không cần khuôn riêng từng màn).
import { StyleSheet, View } from 'react-native';
import { colors, shape, space } from '../theme/tokens';

export function SkeletonCard({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Đang tải">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 56,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: shape.small,
    marginBottom: space.sm,
  },
});
