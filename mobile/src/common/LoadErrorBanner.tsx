import { Banner, Text } from 'react-native-paper';
import { StyleSheet } from 'react-native';
import { ApiError, NetworkError } from '../api/client';
import { colors, space } from '../theme/tokens';
import { ErrorIcon, bannerActionStyle } from './bannerParts';

// trước đây mọi màn dữ liệu (`catch { setError(true) }`) hiện
// đúng MỘT câu chung ("Không tải được...") cho mọi loại lỗi — mất mạng, quyền hết hạn
// (401/403), lỗi máy chủ (500) đều giống hệt nhau, người dùng không biết phải làm gì khác
// nhau (thử lại tại chỗ hay đăng nhập lại). Component dùng chung đọc `error` gốc (giữ
// nguyên qua `.catch(setError)` thay vì `.catch(() => setError(true))`) để phân biệt.
export function describeLoadError(error: unknown): { message: string; isAuth: boolean } {
  if (error instanceof NetworkError) {
    return { message: 'Mất kết nối — đang thử lại.', isAuth: false };
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { message: 'Phiên đăng nhập đã hết hạn — đăng nhập lại giúp mình.', isAuth: true };
    }
    if (error.status >= 500) {
      return { message: 'Máy chủ đang gặp sự cố — thử lại sau ít phút.', isAuth: false };
    }
    return { message: error.message || 'Có lỗi xảy ra — thử lại.', isAuth: false };
  }
  return { message: 'Có lỗi xảy ra — thử lại.', isAuth: false };
}

export function LoadErrorBanner({
  error,
  onRetry,
  onReauth,
}: {
  error: unknown;
  onRetry: () => void;
  onReauth?: () => void;
}) {
  const { message, isAuth } = describeLoadError(error);
  const actions =
    isAuth && onReauth ? [{ ...bannerActionStyle, label: 'Đăng nhập lại', onPress: onReauth }] : [{ ...bannerActionStyle, label: 'Thử lại', onPress: onRetry }];
  return (
    // banner bám mép trên, KHÔNG cuộn theo — nơi gọi phải đặt
    // component này NGOÀI ScrollView/FlatList, đúng khuôn đã sửa ở CreateTaskScreen.
    <Banner visible icon={ErrorIcon} style={styles.banner} actions={actions}>
      <Text style={styles.text}>{message}</Text>
    </Banner>
  );
}

const styles = StyleSheet.create({
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  text: { color: colors.onErrorContainer },
});
