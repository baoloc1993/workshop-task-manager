import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, space, tapMin } from '../theme/tokens';

// C13(a) — khối đầu mục (DESIGN-SYSTEM.md §4), dùng cho các màn danh sách (S1, S6, S9,
// S16, S17, S22, S23). KHÔNG dùng ở S0: C13(a) không khai S0, trang chủ dùng `.top` +
// `.search` của C14 (DECISIONS.md 2026-09-19).
//
// Chuyển sắc THẬT `--color-header-start → --color-header-end` bằng
// `experimental_backgroundImage` — style prop trong CORE của React Native 0.86, không phải
// native module, nên không dính rủi ro rebuild đã gây sự cố dogfood vòng 6
// (`expo-notifications`, DECISIONS.md 2026-09-16). Trước 2026-09-19 ở đây là màu ĐẶC
// `--color-header-end`; kiểm thử đo được `--color-header-start` render **0 pixel**
// trên cả ba màn kiểm được — §2.1 ghi rõ "khai token không dùng là gate đỏ".
// `backgroundColor` giữ nguyên làm đường lùi nếu prop experimental đổi tên ở bản RN sau.
// `useSafeAreaInsets` (dogfood khi vừa dựng): không trừ tai thỏ/status bar thì nút back
// nằm lấn lên vùng status bar — bấm không ăn trên emulator thật (đã tự bấm thử phát hiện).
export function ScreenHeader({
  title,
  subtitle,
  canGoBack,
  right,
}: {
  title: string;
  subtitle?: string;
  canGoBack?: boolean;
  /**
   * Chỗ của "⋯" trong C13(a). Ở app đây là các nút điều hướng phụ vốn nằm ở `headerRight`
   * của native-stack (S6 "Việc nhóm"/"Đã xong", S9 "Việc của tôi") — worker/bat chưa có S0
   * nên mất chúng là mất đường đi, không phải mất trang trí. Nút bên trong tự tô trắng để
   * đọc được trên nền khối đầu mục.
   */
  right?: ReactNode;
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
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.headerEnd,
    experimental_backgroundImage: `linear-gradient(160deg, ${colors.headerStart}, ${colors.headerEnd})`,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
  },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: tapMin, marginBottom: space.sm },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  backButton: { margin: 0, width: tapMin, height: tapMin },
  title: { fontSize: fontSize.headline, fontWeight: '700', color: colors.onPrimary, lineHeight: 34 },
  // `opacity: .92` (chép từ `.hdr .d` của prototype) làm trắng thành #EEF3FB trên nền
  // #3670CF = tương phản 4.31, DƯỚI ngưỡng 4.5 của §3 cặp on-primary/header-end
  // (kiểm thử đo trên pixel thật 2026-09-19 — gate pha V tính từ hex trong tài liệu
  // nên không bắt được). Bỏ opacity, giữ trắng đặc: 4.80 đạt.
  subtitle: { fontSize: fontSize.label, color: colors.onPrimary, marginTop: space.xs },
});
