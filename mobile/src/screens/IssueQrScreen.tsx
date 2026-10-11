import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, List, Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../api/client';
import type { CreatePairingResponse, WorkerListItem } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { ErrorIcon } from '../common/bannerParts';

const TTL_MIN = 15;

// "Cho người mới vào app"..
export function IssueQrScreen() {
  // trước đây lọc `paired=false`: thợ đã ghép máy biến mất
  // hẳn khỏi màn này, không còn cách "Cấp lại mã" khi thợ mất/đổi máy. Giờ tải TOÀN BỘ
  // kèm cờ `paired`, hiện đúng trạng thái + nút phù hợp cho từng người.
  const [workers, setWorkers] = useState<WorkerListItem[] | null>(null);
  const [pairing, setPairing] = useState<CreatePairingResponse | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function loadWorkers() {
    api
      .get<WorkerListItem[]>('/users?paired=all')
      .then(setWorkers)
      .catch(() => setError('Không tải được danh sách.'));
  }

  useEffect(loadWorkers, []);

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
            {/* (meta): mã chỉ nằm trong QR, không đọc được —
                trái với EntryScreen "Nhờ chủ xưởng ... đọc mã 6 số cho bạn". Không
                quét được thì không còn đường nào vào app. */}
            <Text variant="displaySmall" style={styles.code}>
              {pairing.code}
            </Text>
            <Text variant="bodyLarge" style={styles.codeHint}>
              Không quét được thì đọc mã này
            </Text>
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
          // về danh sách (rời màn giữa chừng làm mất ngữ cảnh
          // "đang cấp mã cho ai", và câu lỗi cũ "Không tải được danh sách" sai
          // hẳn với hành động người dùng vừa bấm).
          onPress={() => currentUserId && handlePick(currentUserId)}
          style={styles.button}
          contentStyle={{ height: tapMin }}
        >
          Cấp mã mới
        </Button>
      </View>
    );
  }

  return (
    // Banner bám mép trên, không cuộn theo (cùng lý do sửa ở
    // CreateTaskScreen.tsx, kiểm thử).
    <View style={styles.outer}>
      {error && (
        <Banner visible icon={ErrorIcon} style={styles.banner}>
          {error}
        </Banner>
      )}
      <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <Text variant="titleLarge" style={styles.title}>
        Cho người mới vào app
      </Text>
      {workers && workers.length === 0 ? (
        <Text variant="bodyLarge" style={styles.emptyText}>
          Chưa có ai trong danh sách.
        </Text>
      ) : (
        <View style={styles.list}>
          {(workers ?? []).map((u) => (
            <List.Item
              key={u.id}
              title={u.name}
              description={u.paired ? 'Đã quét mã vào app' : undefined}
              onPress={() => handlePick(u.id)}
              style={styles.listItem}
              right={() =>
                u.paired ? (
                  // trước là chữ xám 13px trơn (18dp, không giống nút): nay là nút
                  // chữ `--color-primary` cao >= --tap-min. Bấm = cùng hành động bấm cả hàng.
                  <Button
                    mode="text"
                    textColor={colors.primary}
                    onPress={() => handlePick(u.id)}
                    style={styles.reissueButton}
                    contentStyle={{ minHeight: tapMin }}
                  >
                    Cấp lại mã
                  </Button>
                ) : null
              }
            />
          ))}
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, backgroundColor: colors.surface },
  title: { marginBottom: space.md, textAlign: 'center' },
  banner: { backgroundColor: colors.errorContainer },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  list: { backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  // List.Item mặc định ~49.5dp, dưới --tap-min
  // (48px từ 2026-09-15, xem §1b).
  listItem: { minHeight: tapMin, justifyContent: 'center' },
  reissueButton: { alignSelf: 'center', minHeight: tapMin, justifyContent: 'center' },
  qrContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.surface },
  qrBox: { padding: space.lg, backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  code: { marginTop: space.lg, letterSpacing: 8, fontVariant: ['tabular-nums'] },
  codeHint: { marginTop: space.xs, color: colors.onSurfaceVariant },
  timer: { marginTop: space.md, color: colors.primary },
  expired: { marginBottom: space.md, color: colors.error },
  button: { marginTop: space.lg, borderRadius: shape.small },
});
