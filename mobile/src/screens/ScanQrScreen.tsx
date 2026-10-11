import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';
import { ApiError, NetworkError } from '../api/client';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { KeyboardAvoider } from '../common/KeyboardAvoider';

// "Quét mã để vào app". Người mới, chưa có phiên nào.
//
// màn xin quyền camera có thể đứng yên dù quyền
// hệ thống đã cấp (Expo Go + Android không luôn đồng bộ lại state của hook ngay —
// đặc biệt khi quyền được cấp ngoài luồng requestPermission() của chính màn này).
// Hai lớp vá: (1) tự kiểm tra lại quyền mỗi khi màn lấy lại focus, không chỉ dựa
// vào kết quả của lần bấm request gần nhất; (2) luôn có ô nhập mã 6 số bằng tay —
// mã QR chỉ LÀ 6 số đó mã hoá lại, nên nhập tay là đường lùi thật, không phải giả.
export function ScanQrScreen() {
  const { loginByPairingCode } = useAuth();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useFocusEffect(
    useCallback(() => {
      getPermission();
    }, [getPermission]),
  );

  async function handleScanned(code: string) {
    if (scanned || joining) return;
    setScanned(true);
    setJoining(true);
    setError(null);
    try {
      await loginByPairingCode(code);
    } catch (e) {
      if (e instanceof NetworkError) setError('Mất kết nối — đang thử lại.');
      else if (e instanceof ApiError) setError(e.message);
      else setError('Có lỗi xảy ra, thử lại.');
      setScanned(false);
    } finally {
      setJoining(false);
    }
  }

  const manualEntry = (
    <View style={styles.manualBlock}>
      <Text variant="bodyLarge" style={styles.text}>
        Hoặc nhập mã 6 số chủ xưởng đọc cho bạn
      </Text>
      <TextInput
        mode="outlined"
        value={manualCode}
        onChangeText={(t) => setManualCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.manualInput}
        placeholder="000000"
        placeholderTextColor={colors.outline}
      />
      <Button
        mode="contained"
        onPress={() => handleScanned(manualCode)}
        disabled={manualCode.length !== 6 || joining}
        loading={joining}
        contentStyle={{ height: tapMin }}
        style={styles.actionButton}
      >
        Vào app
      </Button>
    </View>
  );

  // bàn phím số khi gõ mã tay che nút "Vào app" (layout
  // `justifyContent: 'center'` không tự cuộn) — `KeyboardAvoider` dùng chung (§ wrapper).
  if (!permission || !permission.granted) {
    return (
      <KeyboardAvoider>
        <View style={styles.container}>
          <Text variant="bodyLarge" style={styles.text}>
            Cần quyền camera để quét mã.
          </Text>
          <Button mode="outlined" onPress={requestPermission} contentStyle={{ height: tapMin }} style={styles.actionButton}>
            Cho phép dùng camera
          </Button>
          {manualEntry}
          {error && (
            <Text variant="bodyLarge" style={styles.error}>
              {error}
            </Text>
          )}
        </View>
      </KeyboardAvoider>
    );
  }

  return (
    <KeyboardAvoider>
      <View style={styles.container}>
        <Text variant="titleLarge" style={styles.title}>
          Quét mã để vào app
        </Text>
        <View style={styles.cameraFrame}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={joining ? undefined : ({ data }) => handleScanned(data)}
          />
        </View>
        {error && (
          <Text variant="bodyLarge" style={styles.error}>
            {error}
          </Text>
        )}
        {joining && (
          <Text variant="bodyLarge" style={styles.text}>
            Đang ghép máy…
          </Text>
        )}
        {manualEntry}
      </View>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md, backgroundColor: colors.surface },
  title: { marginBottom: space.md },
  cameraFrame: { width: 280, height: 280, borderRadius: shape.small, overflow: 'hidden', backgroundColor: colors.surfaceContainerHigh },
  text: { marginTop: space.md, textAlign: 'center' },
  error: { marginTop: space.md, color: colors.error, textAlign: 'center' },
  manualBlock: { marginTop: space.lg, width: '100%', alignItems: 'stretch' },
  manualInput: { marginBottom: space.md, textAlign: 'center' },
  // ép `--shape-small`, không để mặc định viên thuốc của Paper.
  actionButton: { borderRadius: shape.small },
});
