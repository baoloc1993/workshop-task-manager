import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { colors, space } from '../theme/tokens';

// Màn tạm thay S1 (Tổng hợp xưởng, vòng 5) — 3 lối tới các capability đã giao ở
// vòng 1. Xem context/DECISIONS.md 2026-09-10.
export function OwnerHomeScreen({
  onCreateTask,
  onIssueQr,
  onDevices,
}: {
  onCreateTask: () => void;
  onIssueQr: () => void;
  onDevices: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        Chủ xưởng
      </Text>
      <Button mode="contained" onPress={onCreateTask} style={styles.button} contentStyle={{ height: 64 }}>
        Tạo việc
      </Button>
      <Button mode="contained-tonal" onPress={onIssueQr} style={styles.button} contentStyle={{ height: 64 }}>
        Cho người mới vào app
      </Button>
      <Button mode="contained-tonal" onPress={onDevices} style={styles.button} contentStyle={{ height: 64 }}>
        Máy của thợ
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: space.md, gap: space.md, backgroundColor: colors.surface },
  title: { marginBottom: space.md, textAlign: 'center' },
  button: { borderRadius: 999 },
});
