import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Text } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';
import { ApiError, NetworkError } from '../api/client';
import { colors, space } from '../theme/tokens';

// S8 — "Quét mã để vào app" (PROTOTYPE.md §1). Người mới, chưa có phiên nào.
export function ScanQrScreen() {
  const { loginByPairingCode } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text variant="bodyLarge" style={styles.text}>
          Cần quyền camera để quét mã.
        </Text>
        <Button mode="contained" onPress={requestPermission} contentStyle={{ height: 64 }}>
          Cho phép dùng camera
        </Button>
      </View>
    );
  }

  return (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md, backgroundColor: colors.surface },
  title: { marginBottom: space.md },
  cameraFrame: { width: 280, height: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceContainerHigh },
  text: { marginTop: space.md, textAlign: 'center' },
  error: { marginTop: space.md, color: colors.error, textAlign: 'center' },
});
