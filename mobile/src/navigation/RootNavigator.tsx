import { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Button, Text } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { OwnerLoginScreen } from '../screens/OwnerLoginScreen';
import { ScanQrScreen } from '../screens/ScanQrScreen';
import { OwnerNavigator } from './OwnerNavigator';
import { WorkerNavigator } from './WorkerNavigator';
import { colors, space } from '../theme/tokens';

// Không đăng nhập: chọn "Tôi là chủ xưởng" (email/mật khẩu) hoặc quét mã (S8).
// Owner dùng email/mật khẩu (PRD.md §7); worker/bat-coordinator dùng QR (AC-1).
function EntryScreen() {
  const [mode, setMode] = useState<'choose' | 'owner' | 'scan'>('choose');

  if (mode === 'owner') return <OwnerLoginScreen />;
  if (mode === 'scan') return <ScanQrScreen />;

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        task-manager
      </Text>
      <Button mode="contained" onPress={() => setMode('scan')} style={styles.button} contentStyle={{ height: 64 }}>
        Quét mã để vào app
      </Button>
      <Text variant="bodyMedium" style={styles.hint}>
        Nhờ chủ xưởng đưa mã hoặc đọc mã 6 số cho bạn
      </Text>
      <Button mode="outlined" onPress={() => setMode('owner')} style={styles.button} contentStyle={{ height: 64 }}>
        Tôi là chủ xưởng
      </Button>
    </View>
  );
}

export function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      {!user ? (
        <EntryScreen />
      ) : user.role === 'owner' ? (
        <OwnerNavigator />
      ) : (
        <WorkerNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: space.md, gap: space.md, backgroundColor: colors.surface },
  title: { marginBottom: space.lg, textAlign: 'center' },
  button: { borderRadius: 999 },
  hint: { textAlign: 'center', color: colors.onSurfaceVariant, marginTop: -space.sm },
});
