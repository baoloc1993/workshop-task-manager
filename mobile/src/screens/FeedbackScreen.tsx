import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { api, ApiError } from '../api/client';
import { colors, shape, space, tapMin } from '../theme/tokens';

// Nhóm 4 production-ready — "kênh feedback" (review pha P vòng 6). Một form gửi thẳng
// là đủ theo shared-production-ready/SKILL.md; chưa cần màn đọc lại (owner tra qua DB
// trong lúc pilot vòng 7, ROADMAP.md §3 nếu cần dựng màn riêng sau).
export function FeedbackScreen({ onDone }: { onDone: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/feedback', { message: message.trim() });
      setSent(true);
      setMessage('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text variant="titleMedium" style={styles.sentText}>
          Đã gửi. Cảm ơn góp ý của bạn.
        </Text>
        <Button mode="contained" onPress={onDone} contentStyle={{ height: tapMin }} style={styles.button}>
          Xong
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenTitle>Góp ý</ScreenTitle>
      {error && (
        <Banner visible icon="alert-circle" style={styles.banner} actions={[{ label: 'Đóng', onPress: () => setError(null) }]}>
          {error}
        </Banner>
      )}
      <Text variant="bodyLarge" style={styles.hint}>
        Thấy chỗ nào khó dùng, hoặc muốn góp ý gì — viết ở đây.
      </Text>
      <TextInput
        mode="outlined"
        multiline
        numberOfLines={6}
        value={message}
        onChangeText={setMessage}
        style={styles.input}
      />
      <Button
        mode="contained"
        onPress={handleSend}
        loading={sending}
        disabled={sending || !message.trim()}
        contentStyle={{ height: tapMin }}
        style={styles.button}
      >
        {sending ? 'Đang gửi…' : 'Gửi góp ý'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  hint: { marginBottom: space.md, color: colors.onSurfaceVariant },
  input: { marginBottom: space.md },
  button: { borderRadius: shape.small },
  sentText: { marginBottom: space.md, color: colors.onSurface },
});
