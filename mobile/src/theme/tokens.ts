/**
 * Bảng token — sao chép NGUYÊN VẸN từ
 * Ràng buộc thực thi §6.2: đổ lại đúng bảng này vào theme của React Native
 * Paper — không đẻ giá trị mới. Đổi giá trị ở đây phải có 1 dòng.
 * Neo tham chiếu từ 2026-09-15: Microsoft To Do (§1, §1b) — bảng Fluent, không phải MD3 gốc.
 */

export const colors = {
  primary: '#2564CF',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DCE8FB',
  onPrimaryContainer: '#123B7A',
  secondary: '#8A5A00',
  secondaryContainer: '#FFF4CE',
  onSecondaryContainer: '#3D2600',
  tertiary: '#107C41',
  tertiaryContainer: '#DDF5E6',
  onTertiaryContainer: '#0B4A26',
  surface: '#F3F4F8',
  surfaceContainer: '#FFFFFF',
  surfaceContainerHigh: '#E1DFDD',
  onSurface: '#1B1B1F',
  onSurfaceVariant: '#605E5C',
  outline: '#8A8886',
  outlineVariant: '#E1DFDD',
  headerStart: '#2456B8',
  headerEnd: '#3670CF',
  error: '#C62828',
  onError: '#FFFFFF',
  errorContainer: '#FDE7E9',
  onErrorContainer: '#6B1425',
} as const;

export const fontSize = {
  label: 14,
  body: 16,
  title: 20,
  headline: 30,
} as const;

export const fontFamily = 'Roboto, sans-serif';

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;

export const shape = {
  small: 8,
  medium: 12,
  full: 999,
} as const;

// §1b — về chuẩn MD3 (48dp) từ 2026-09-15: thử nghiệm có điều kiện,.
export const tapMin = 48;
// react-native-paper Chip: `style.minHeight` chỉ giãn container flex, KHÔNG giãn vùng
// chạm thật của TouchableRipple bên trong (đo được ~32dp dù minHeight=48,
// tap thử vào vùng đệm phía trên/dưới chip không đăng ký). Bù bằng hitSlop cho đủ tapMin.
export const chipHitSlop = { top: 8, bottom: 8 } as const;
// Thanh "＋ Ghi đơn mới" ghim đáy (thay cho navigation bar — không còn tab đáy).
export const navHeight = 64;

export const statePressed = 'rgba(26,28,30,0.10)';
