import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// lấy Expo push token để gửi kèm khi ghép máy. Best-effort:
// permission bị từ chối, chạy trên simulator không hỗ trợ, hay bất kỳ lỗi nào khác đều trả
// undefined thay vì throw — ghép máy KHÔNG được phép hỏng vì thiếu push.
// Áp dụng cả hai chiều: lỗi push không hỏng việc, và không hỏng cả việc vào app.
export async function getExpoPushTokenAsync(): Promise<string | undefined> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Nhắc việc',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    const granted =
      existing.status === 'granted' ? true : (await Notifications.requestPermissionsAsync()).status === 'granted';
    if (!granted) return undefined;

    const { data } = await Notifications.getExpoPushTokenAsync();
    return data;
  } catch {
    return undefined;
  }
}

// Gọi một lần khi app khởi động (App.tsx) — hiện thông báo dạng banner + âm thanh ngay
// cả khi app đang mở (mặc định của expo-notifications là im lặng nếu không set cái này).
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
