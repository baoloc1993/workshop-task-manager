import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { colors, space } from '../theme/tokens';

// Màn tạm thay S1 (Tổng hợp xưởng, vòng 5) — lối tới các capability đã giao.
// Xem context/DECISIONS.md 2026-09-10. Vòng 2: nói để giao việc là đường CHÍNH
// (PRD.md §5 "Bắt buộc gõ tay để tạo việc" — cấm), gõ tay chỉ còn là đường dự phòng.
export function OwnerHomeScreen({
  onCreateTask,
  onVoiceCapture,
  onIssueQr,
  onDevices,
  onBatQueue,
}: {
  onCreateTask: () => void;
  onVoiceCapture: () => void;
  onIssueQr: () => void;
  onDevices: () => void;
  onBatQueue: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        Chủ xưởng
      </Text>
      <Button mode="contained" onPress={onVoiceCapture} style={styles.button} contentStyle={{ height: 64 }}>
        🎤 Nói để giao việc
      </Button>
      <Button mode="outlined" onPress={onCreateTask} style={styles.button} contentStyle={{ height: 64 }}>
        Gõ tay
      </Button>
      <Button mode="outlined" onPress={onBatQueue} style={styles.button} contentStyle={{ height: 64 }}>
        Việc bạt chờ chia
      </Button>
      <Button mode="outlined" onPress={onIssueQr} style={styles.button} contentStyle={{ height: 64 }}>
        Cho người mới vào app
      </Button>
      <Button mode="outlined" onPress={onDevices} style={styles.button} contentStyle={{ height: 64 }}>
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
