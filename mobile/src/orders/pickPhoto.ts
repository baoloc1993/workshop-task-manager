import * as ImagePicker from 'expo-image-picker';

// C21 "Ô ảnh" (DESIGN-SYSTEM.md §4) — chụp ảnh tờ đo / bộ ghế. Lưu thẳng data-URI base64
// trong Order (không có blob storage — DECISIONS.md 2026-09-18): nén mạnh (quality thấp,
// resize) TRƯỚC khi gửi, vì mỗi ảnh đi thẳng vào một cột text/Json của Postgres.
export async function takePhotoAsBase64(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.3,
    allowsEditing: false,
    mediaTypes: ['images'],
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const mime = result.assets[0].mimeType ?? 'image/jpeg';
  return `data:${mime};base64,${result.assets[0].base64}`;
}
