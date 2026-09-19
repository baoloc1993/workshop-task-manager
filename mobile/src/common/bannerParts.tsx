// Vòng 8 (picky 2026-09-19) — phần dùng chung cho Banner lỗi (DESIGN-SYSTEM.md §4 C5):
// icon "!" đen mặc định của Paper -> `--color-error`; nút hành động trong banner (mặc định
// Paper cao ~38dp) -> đủ `--tap-min` (Button tự viết nên minHeight có tác dụng thật).
import { Icon } from 'react-native-paper';
import { colors, tapMin } from '../theme/tokens';

export function ErrorIcon({ size }: { size: number }) {
  return <Icon source="alert-circle" size={size} color={colors.error} />;
}

export const bannerActionStyle = { style: { minHeight: tapMin }, contentStyle: { minHeight: tapMin } } as const;
