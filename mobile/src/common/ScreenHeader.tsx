import { StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, space, tapMin } from '../theme/tokens';

// C13(a) — khối đầu mục (DESIGN-SYSTEM.md §4), dùng cho các màn "trang chủ danh sách"
// (S0, S1, S17...). Dùng nền màu đặc `--color-header-end` thay vì gradient thật:
// `expo-linear-gradient` là native module mới, đúng loại rủi ro đã gây sự cố dogfood vòng 6
// (`expo-notifications` quên rebuild native làm app crash trước demo, DECISIONS.md
// 2026-09-16) — không đáng đánh đổi cho một hiệu ứng thị giác không ảnh hưởng chức năng.
// `useSafeAreaInsets` (dogfood khi vừa dựng): không trừ tai thỏ/status bar thì nút back
// nằm lấn lên vùng status bar — bấm không ăn trên emulator thật (đã tự bấm thử phát hiện).
export function ScreenHeader({
  title,
  subtitle,
  canGoBack,
}: {
  title: string;
  subtitle?: string;
  canGoBack?: boolean;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.bar}>
        {canGoBack ? (
          <IconButton
            icon="arrow-left"
            size={24}
            iconColor={colors.onPrimary}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Quay lại"
            style={styles.backButton}
          />
        ) : (
          <View style={styles.backButton} />
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.headerEnd,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: tapMin, marginBottom: space.sm },
  backButton: { margin: 0, width: tapMin, height: tapMin },
  title: { fontSize: fontSize.headline, fontWeight: '700', color: colors.onPrimary, lineHeight: 34 },
  subtitle: { fontSize: fontSize.label, color: colors.onPrimary, opacity: 0.92, marginTop: space.xs },
});
