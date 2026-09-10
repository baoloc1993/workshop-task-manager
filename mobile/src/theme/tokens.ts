/**
 * Bảng token — sao chép NGUYÊN VẸN từ context/DESIGN-SYSTEM.md §2 (pha V).
 * Ràng buộc thực thi §6.2: pha I đổ lại đúng bảng này vào theme của React Native
 * Paper — không đẻ giá trị mới. Đổi giá trị ở đây phải có 1 dòng context/DECISIONS.md.
 */

export const colors = {
  primary: '#00696E',
  onPrimary: '#FFFFFF',
  primaryContainer: '#9CF1F6',
  onPrimaryContainer: '#002022',
  secondary: '#7A5900',
  secondaryContainer: '#FFDF9B',
  onSecondaryContainer: '#261A00',
  tertiary: '#386A20',
  tertiaryContainer: '#B8F397',
  onTertiaryContainer: '#062100',
  surface: '#FAFDFC',
  surfaceContainer: '#E7EEED',
  surfaceContainerHigh: '#DBE4E3',
  onSurface: '#191C1C',
  onSurfaceVariant: '#3F4948',
  outline: '#6F7979',
  outlineVariant: '#BEC9C8',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
} as const;

export const fontSize = {
  label: 16,
  body: 20,
  title: 24,
  headline: 32,
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

// §1b — cố tình lệch chuẩn MD3 (48dp): ngón tay dính chỉ, chạm vội giữa hai lượt việc.
export const tapMin = 64;
export const navHeight = 88;

export const statePressed = 'rgba(26,28,30,0.10)';
