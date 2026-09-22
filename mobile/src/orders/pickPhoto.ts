import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// C21 "Ô ảnh" (DESIGN-SYSTEM.md §4) — chụp ảnh tờ đo / bộ ghế. Lưu thẳng data-URI base64
// trong Order (không có blob storage — DECISIONS.md 2026-09-18): nén mạnh (quality thấp,
// resize) TRƯỚC khi gửi, vì mỗi ảnh đi thẳng vào một cột text/Json của Postgres.
export async function takePhotoAsBase64(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    // dogfood vòng 9: trước đây từ chối quyền (hoặc lỡ chạm ra ngoài hộp xin quyền) thì
    // chạm ô ảnh không có phản ứng gì — người dùng tưởng app hỏng. Android không hiện lại
    // hộp xin quyền sau lần từ chối, nên chỉ đường vào Cài đặt.
    Alert.alert('Chưa cho app dùng máy ảnh', 'Bật quyền Máy ảnh cho app trong Cài đặt rồi chụp lại.', [
      { text: 'Để sau', style: 'cancel' },
      { text: 'Mở Cài đặt', onPress: () => void Linking.openSettings() },
    ]);
    return null;
  }

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
