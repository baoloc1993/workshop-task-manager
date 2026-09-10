import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, List, Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../api/client';
import type { CreatePairingResponse, WorkerListItem } from '../api/types';
import { colors, space } from '../theme/tokens';

const TTL_MIN = 15;

// S5 — "Cho người mới vào app" (PROTOTYPE.md §1). AC-1.
export function IssueQrScreen() {
  const [unpaired, setUnpaired] = useState<WorkerListItem[] | null>(null);
  const [pairing, setPairing] = useState<CreatePairingResponse | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function loadUnpaired() {
    api
      .get<WorkerListItem[]>('/users?paired=false')
      .then(setUnpaired)
      .catch(() => setError('Không tải được danh sách.'));
  }

  useEffect(loadUnpaired, []);

  useEffect(() => {
    if (!pairing) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSec(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairing]);

  async function handlePick(userId: string) {
    setError(null);
    setCurrentUserId(userId);
    try {
      const res = await api.post<CreatePairingResponse>('/auth/pairings', { userId });
      setPairing(res);
    } catch {
      setError('Không tạo được mã — thử lại.');
    }
  }

  if (pairing) {
    const mm = Math.floor(remainingSec / 60);
    const ss = String(remainingSec % 60).padStart(2, '0');
    return (
      <View style={styles.qrContainer}>
        <Text variant="titleLarge" style={styles.title}>
          Đưa máy này cho {pairing.userName} quét
        </Text>
        {remainingSec > 0 ? (
          <>
            <View style={styles.qrBox}>
              <QRCode value={pairing.code} size={220} />
            </View>
            <Text variant="headlineSmall" style={styles.timer}>
              {mm}:{ss}
            </Text>
          </>
        ) : (
          <Text variant="bodyLarge" style={styles.expired}>
            Mã hết hạn — xin cấp mã mới.
          </Text>
        )}
        {error && (
          <Text variant="bodyLarge" style={styles.expired}>
            {error}
          </Text>
        )}
        <Button
          mode="contained"
          // Cấp lại mã cho CHÍNH người đang xem — ở lại đúng màn này, không rời
          // về danh sách (dogfood pha I: rời màn giữa chừng làm mất ngữ cảnh
          // "đang cấp mã cho ai", và câu lỗi cũ "Không tải được danh sách" sai
          // hẳn với hành động người dùng vừa bấm).
          onPress={() => currentUserId && handlePick(currentUserId)}
          style={styles.button}
          contentStyle={{ height: 64 }}
        >
          Cấp mã mới
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <Text variant="titleLarge" style={styles.title}>
        Cho người mới vào app
      </Text>
      {error && (
        <Banner visible icon="alert-circle" style={styles.banner}>
          {error}
        </Banner>
      )}
      {unpaired && unpaired.length === 0 ? (
        <Text variant="bodyLarge" style={styles.emptyText}>
          Mọi người đã ghép máy.
        </Text>
      ) : (
        <View style={styles.list}>
          {(unpaired ?? []).map((u) => (
            <List.Item key={u.id} title={u.name} onPress={() => handlePick(u.id)} style={styles.listItem} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { marginBottom: space.md, textAlign: 'center' },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  list: { backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  // dogfood pha I: List.Item mặc định ~49.5dp, dưới ngân sách
  // vùng chạm 64px cố ý nâng cho persona 55 tuổi lão thị (DESIGN-SYSTEM.md §1b).
  listItem: { minHeight: 64, justifyContent: 'center' },
  qrContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.surface },
  qrBox: { padding: space.lg, backgroundColor: '#FFFFFF', borderRadius: 12 },
  timer: { marginTop: space.md, color: colors.primary },
  expired: { marginBottom: space.md, color: colors.error },
  button: { marginTop: space.lg, borderRadius: 999 },
});
