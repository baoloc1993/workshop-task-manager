import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../auth/AuthContext';
import { ApiError, NetworkError } from '../api/client';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { ErrorIcon } from '../common/bannerParts';

// Màn bootstrap riêng cho chủ xưởng (email/mật khẩu) — không thuộc bộ mã S<n> của
// PROTOTYPE.md §1, xem context/DECISIONS.md 2026-09-10 (bản đồ màn chưa phủ bước này).
export function OwnerLoginScreen() {
  const { loginOwner } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSending(true);
    try {
      await loginOwner(email.trim(), password);
    } catch (e) {
      if (e instanceof NetworkError) setError('Mất kết nối — kiểm tra mạng rồi thử lại.');
      else if (e instanceof ApiError) setError(e.message);
      else setError('Có lỗi xảy ra, thử lại.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        Đăng nhập chủ xưởng
      </Text>
      {error && (
        <Banner visible icon={ErrorIcon} style={styles.banner}>
          {error}
        </Banner>
      )}
      <TextInput
        label="Email"
        mode="outlined"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        label="Mật khẩu"
        mode="outlined"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={sending}
        disabled={sending || !email || !password}
        style={styles.button}
        contentStyle={{ height: tapMin }}
      >
        {sending ? 'Đang vào…' : 'Vào app'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: space.md, backgroundColor: colors.surface },
  title: { marginBottom: space.lg, textAlign: 'center' },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  input: { marginBottom: space.sm },
  button: { marginTop: space.md, borderRadius: shape.small },
});
