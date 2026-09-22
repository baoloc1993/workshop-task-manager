// C21 "Ô ảnh" (DESIGN-SYSTEM.md §4) — khung bo `--shape-small` nét đứt `--color-outline`
// khi chưa có ảnh, nét liền `--color-primary` khi đã có; chữ nói rõ chụp gì. Trước đây
// dùng chung khuôn nút C1 (nền đặc), không phân biệt được với hành động thường — dogfood
// pha I vòng 7.
//
// Vòng 9 (AC-42, feedback B3) — trạng thái "xem trước": chụp xong KHÔNG dùng ngay mà mở ảnh
// toàn màn (nền `--color-on-surface`) với "Dùng ảnh này" (C1) / "Chụp lại"; huỷ (nút Huỷ
// hoặc phím Back) KHÔNG xoá ảnh cũ. Chạm ảnh đã có → xem to, có "Chụp lại". PhotoBox tự lo
// cả luồng chụp nên mọi nơi dùng (S18, S20) cùng một hành vi — trước đây S18 gán thẳng kết
// quả camera, huỷ camera là mất luôn ảnh cũ (`setPhoto(null)`).
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { takePhotoAsBase64 } from './pickPhoto';

type Preview = { uri: string; mode: 'new' | 'view' };

export function PhotoBox({
  photo,
  label,
  retakeLabel,
  required,
  onConfirm,
}: {
  photo: string | null;
  label: string;
  retakeLabel?: string;
  required?: boolean;
  /** Chỉ gọi khi người dùng chạm "Dùng ảnh này" — ảnh cũ giữ nguyên tới lúc đó. */
  onConfirm: (dataUri: string) => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Đóng lớp xem trước TRƯỚC khi mở camera: mở camera đè lên RN Modal đang hiện không chạy
  // ổn trên iOS. Huỷ camera → quay lại đúng thứ đang xem (hoặc không gì nếu chưa có ảnh).
  async function capture(back: Preview | null) {
    if (capturing) return;
    setCapturing(true);
    setPreview(null);
    try {
      const uri = await takePhotoAsBase64();
      setPreview(uri ? { uri, mode: 'new' } : back);
    } finally {
      setCapturing(false);
    }
  }

  function handleBoxPress() {
    if (photo) setPreview({ uri: photo, mode: 'view' });
    else capture(null);
  }

  async function handleUse() {
    if (!preview) return;
    const uri = preview.uri;
    setPreview(null);
    await onConfirm(uri);
  }

  return (
    <>
      <Pressable
        onPress={handleBoxPress}
        disabled={capturing}
        style={[styles.box, photo ? styles.boxFilled : styles.boxEmpty]}
        accessibilityRole="button"
        accessibilityLabel={photo ? `${label} — chạm để xem to` : label}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
        ) : (
          <Text style={styles.emptyText}>
            {label}
            {required ? ' — bắt buộc' : ''}
          </Text>
        )}
        {photo && <Text style={styles.retakeLabel}>{retakeLabel ?? 'Chạm để xem to'}</Text>}
      </Pressable>

      <Modal
        visible={preview !== null}
        animationType="fade"
        onRequestClose={() => setPreview(null)}
        statusBarTranslucent
      >
        {preview && (
          <View style={[styles.previewRoot, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md }]}>
            {preview.mode === 'new' && (
              <Button
                mode="text"
                onPress={() => setPreview(null)}
                textColor={colors.surface}
                style={styles.cancel}
                contentStyle={{ minHeight: tapMin }}
              >
                Huỷ
              </Button>
            )}
            <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />
            <Button
              mode="contained"
              onPress={preview.mode === 'new' ? handleUse : () => setPreview(null)}
              style={styles.useButton}
              contentStyle={{ height: tapMin }}
            >
              {preview.mode === 'new' ? 'Dùng ảnh này' : 'Đóng'}
            </Button>
            {/* "Chụp lại" chữ --color-primary-container thay vì --color-primary như §4 C21
                ghi: #2564CF trên nền on-surface #1B1B1F chỉ ~3:1, dưới ngưỡng 4.5 của chữ
                (§3); prototype `.preview .again` cũng dùng primary-container. */}
            <Button
              mode="text"
              onPress={() => capture(preview)}
              textColor={colors.primaryContainer}
              contentStyle={{ minHeight: tapMin }}
            >
              Chụp lại
            </Button>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: shape.small, minHeight: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  boxEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outline, backgroundColor: colors.surfaceContainer },
  // dogfood vòng 9: Android giữ lại `dashed` của boxEmpty khi đổi style nếu không ghi đè
  // tường minh — ô đã có ảnh vẫn nét đứt, lệch C21 ("nét liền khi đã có").
  boxFilled: { borderWidth: 1, borderStyle: 'solid', borderColor: colors.primary },
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
  // C21 "xem trước" — ảnh toàn màn nền --color-on-surface.
  previewRoot: { flex: 1, backgroundColor: colors.onSurface, paddingHorizontal: space.md },
  cancel: { alignSelf: 'flex-end' },
  previewImage: { flex: 1, width: '100%', marginVertical: space.md },
  useButton: { borderRadius: shape.small, marginBottom: space.xs },
});
