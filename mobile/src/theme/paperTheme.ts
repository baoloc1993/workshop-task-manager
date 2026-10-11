import { MD3LightTheme } from 'react-native-paper';
import { colors, fontFamily, fontSize } from './tokens';

// Đổ bảng token §2.1 thẳng vào MD3LightTheme — tên vai trò khớp nhau nên không phải
// dịch tên (lý do chọn Paper).
export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    primaryContainer: colors.primaryContainer,
    onPrimaryContainer: colors.onPrimaryContainer,
    secondary: colors.secondary,
    secondaryContainer: colors.secondaryContainer,
    onSecondaryContainer: colors.onSecondaryContainer,
    tertiary: colors.tertiary,
    tertiaryContainer: colors.tertiaryContainer,
    onTertiaryContainer: colors.onTertiaryContainer,
    surface: colors.surface,
    surfaceVariant: colors.surfaceContainer,
    onSurface: colors.onSurface,
    onSurfaceVariant: colors.onSurfaceVariant,
    outline: colors.outline,
    outlineVariant: colors.outlineVariant,
    error: colors.error,
    onError: colors.onError,
    errorContainer: colors.errorContainer,
    onErrorContainer: colors.onErrorContainer,
    background: colors.surface,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: colors.surface,
      level1: colors.surfaceContainer,
      level2: colors.surfaceContainerHigh,
    },
  },
  fonts: {
    ...MD3LightTheme.fonts,
    labelLarge: { ...MD3LightTheme.fonts.labelLarge, fontFamily, fontSize: fontSize.label },
    bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, fontFamily, fontSize: fontSize.body },
    titleLarge: { ...MD3LightTheme.fonts.titleLarge, fontFamily, fontSize: fontSize.title },
    headlineSmall: { ...MD3LightTheme.fonts.headlineSmall, fontFamily, fontSize: fontSize.headline },
  },
};
