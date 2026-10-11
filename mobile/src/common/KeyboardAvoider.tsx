import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';

// AC-26 (vòng 8, CAP-BUG-02) — bàn phím số/chữ che ô nhập hoặc nút hành động ở nhiều màn
// khác nhau (form đo S20 `MeasurementEditor`, S3 "Xem lại rồi giao" che nút "Giao việc",
// S8 "Quét mã" che nút "Vào app") — một wrapper dùng chung thay vì vá lệch offset từng
// màn một. `padding` trên iOS (đẩy nội dung lên bằng đúng chiều cao bàn phím), `height`
// trên Android (co chiều cao view lại — khớp cách `android:windowSoftInputMode` mặc định
// của Expo đã xử lý phần lớn, wrapper chỉ bù thêm cho các layout `justifyContent: 'center'`
// không tự cuộn được).
export function KeyboardAvoider({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
