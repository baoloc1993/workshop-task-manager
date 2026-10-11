import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// C21 "Ô ảnh" — chụp ảnh tờ đo / bộ ghế. Lưu thẳng data-URI base64
// trong Order (không có blob storage): nén mạnh (quality thấp,
// resize) TRƯỚC khi gửi, vì mỗi ảnh đi thẳng vào một cột text/Json của Postgres.
// trả kèm `denied` để PhotoBox KHÔNG mở lại lớp xem trước đè lên hộp báo.
export async function takePhoto(): Promise<{ uri: string | null; denied: boolean }> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    // trước đây từ chối quyền (hoặc lỡ chạm ra ngoài hộp xin quyền) thì
    // chạm ô ảnh không có phản ứng gì — người dùng tưởng app hỏng. Android không hiện lại
    // hộp xin quyền sau lần từ chối, nên chỉ đường vào Cài đặt.
    Alert.alert('Chưa cho app dùng máy ảnh', 'Bật quyền Máy ảnh cho app trong Cài đặt rồi chụp lại.', [
      { text: 'Để sau', style: 'cancel' },
      { text: 'Mở Cài đặt', onPress: () => void Linking.openSettings() },
    ]);
    return { uri: null, denied: true };
  }

  const result = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.3,
    allowsEditing: false,
    mediaTypes: ['images'],
  });
  if (result.canceled || !result.assets?.[0]?.base64) return { uri: null, denied: false };
  const mime = result.assets[0].mimeType ?? 'image/jpeg';
  return { uri: `data:${mime};base64,${result.assets[0].base64}`, denied: false };
}

export async function takePhotoAsBase64(): Promise<string | null> {
  return (await takePhoto()).uri;
}
