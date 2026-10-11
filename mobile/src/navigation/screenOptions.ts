import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { colors, fontFamily, fontSize } from '../theme/tokens';

/**
 * C13(b) — "thanh mảnh" đầu màn cho màn chi tiết / form (DESIGN-SYSTEM.md §4).
 * Prototype dựng bằng `.thin`: nền `--color-surface`, vụn đường dẫn `--text-label` màu
 * `--color-on-surface-variant`, nút ‹ màu `--color-on-surface`, không đường kẻ dưới.
 *
 * Trước 2026-09-19 ba navigator dùng header MẶC ĐỊNH của native-stack — nền trắng, chữ
 * 20px canh giữa (Android) của hệ điều hành, KHÔNG đi qua một token nào của §2. Đó là
 * phần lớn nhất của khiếu nại "app không giống design ở html" xét theo số màn
 * (`DECISIONS.md` 2026-09-19).
 *
 * Vụn đường dẫn để đúng 14px như prototype: ở prototype mọi màn thin-bar đều mang tiêu đề
 * thật TRONG THÂN màn, nên 14px không phải tiêu đề. Màn nào của app còn thiếu tiêu đề thân
 * thì bổ sung ở chính màn đó (`--text-title`), không phóng to vụn đường dẫn — xem
 * STATE.md §Challenge log 2026-09-19.
 */
export const thinHeader: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: false,
  headerTintColor: colors.onSurface,
  headerTitleAlign: 'left',
  headerTitleStyle: {
    fontFamily,
    fontSize: fontSize.label,
    fontWeight: '400',
    color: colors.onSurfaceVariant,
  },
};
