import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, StyleSheet, View } from 'react-native';
import { Banner, Button, Card, Text } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { api } from '../api/client';
import type { DevicePairing } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

// "Máy của thợ".: thu hồi máy cũ, cấp lại mã mới.
export function DevicesScreen({ onIssueNew }: { onIssueNew: () => void }) {
  const [devices, setDevices] = useState<DevicePairing[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    api
      .get<DevicePairing[]>('/auth/devices')
      .then(setDevices)
      .catch(() => setError(true));
  }, []);

  useFocusEffect(load);

  async function handleRevoke(id: string) {
    try {
      await api.post(`/auth/devices/${id}/revoke`);
      load();
    } catch {
      setError(true);
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Banner visible icon={ErrorIcon} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: load }]} style={styles.banner}>
          Không tải được danh sách máy.
        </Banner>
      </View>
    );
  }

  if (devices && devices.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          Chưa ai quét mã để vào app.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md }}
      ListHeaderComponent={<ScreenTitle>Máy của thợ</ScreenTitle>}
      data={devices ?? []}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">{item.user.name}</Text>
            <Text variant="bodyLarge" style={styles.meta}>
              {/* đổi "ghép ngày" -> "vào app ngày", tránh thuật ngữ nội bộ
                  "ghép"/"pairing"; đúng chữ EntryScreen đã dùng ("Quét mã để vào app"). */}
              {item.deviceLabel ?? 'Máy chưa đặt tên'} · vào app ngày{' '}
              {item.usedAt ? new Date(item.usedAt).toLocaleDateString('vi-VN') : '—'}
            </Text>
            {item.revokedAt ? (
              <Text variant="bodyLarge" style={styles.revoked}>
                Đã thu hồi
              </Text>
            ) : (
              <Button
                mode="outlined"
                onPress={() => handleRevoke(item.id)}
                style={styles.revokeButton}
                contentStyle={{ height: tapMin }}
              >
                Thu hồi máy
              </Button>
            )}
          </Card.Content>
        </Card>
      )}
      ListFooterComponent={
        <Button mode="contained" onPress={onIssueNew} style={styles.newButton} contentStyle={{ height: tapMin }}>
          Cấp mã mới
        </Button>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { margin: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: colors.surface },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  card: { marginBottom: 3, backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  meta: { marginTop: space.xs, color: colors.onSurfaceVariant },
  revoked: { marginTop: space.sm, color: colors.error },
  revokeButton: { marginTop: space.sm, alignSelf: 'flex-start', borderRadius: shape.small },
  newButton: { marginTop: space.md, borderRadius: shape.small },
});
