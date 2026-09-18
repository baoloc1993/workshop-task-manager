// C21 "Ô ảnh" (DESIGN-SYSTEM.md §4) — khung bo `--shape-small` nét đứt `--color-outline`
// khi chưa có ảnh, nét liền `--color-primary` khi đã có; chữ nói rõ chụp gì. Trước đây
// dùng chung khuôn nút C1 (nền đặc), không phân biệt được với hành động thường — dogfood
// pha I vòng 7.
import { Image, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, fontSize, shape, space } from '../theme/tokens';

export function PhotoBox({
  photo,
  label,
  retakeLabel,
  required,
  onPress,
}: {
  photo: string | null;
  label: string;
  retakeLabel?: string;
  required?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.box, photo ? styles.boxFilled : styles.boxEmpty]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
      ) : (
        <Text style={styles.emptyText}>
          {label}
          {required ? ' — bắt buộc' : ''}
        </Text>
      )}
      {photo && <Text style={styles.retakeLabel}>{retakeLabel ?? 'Chạm để chụp lại'}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: shape.small, minHeight: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  boxEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outline, backgroundColor: colors.surfaceContainer },
  boxFilled: { borderWidth: 1, borderColor: colors.primary },
  image: { width: '100%', height: 160 },
  emptyText: { color: colors.onSurfaceVariant, padding: space.md, textAlign: 'center', fontSize: fontSize.body },
  retakeLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(27,27,31,0.6)',
    color: colors.onPrimary,
    fontSize: fontSize.label,
    textAlign: 'center',
    paddingVertical: space.xs,
  },
});
