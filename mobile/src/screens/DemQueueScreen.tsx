import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Banner, Button, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, shape, space, tapMin } from '../theme/tokens';
import { TaskRow } from '../tasks/TaskRow';
import { GROUP_LABEL, STEP_GROUP, STEP_LABEL } from '../orders/orderStatus';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';
import { SkeletonCard } from '../common/SkeletonCard';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

// ai rảnh thì nhận, không ai chia (khác
// hẳn S9 của mảng bạt). Một thợ nhiều nhóm thấy việc GỘP của mọi nhóm mình thuộc trong
// MỘT danh sách (client không chọn 1 nhóm).
export function DemQueueScreen({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await api.get<Task[]>('/tasks/dem-queue'));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleClaim(task: Task) {
    if (claimingId) return;
    setClaimingId(task.id);
    setClaimError(null);
    try {
      await api.post(`/tasks/${task.id}/claim`);
      if (user) track('nhan_viec_dem', user.id, { taskId: task.id });
      await load();
    } catch (e) {
      setClaimError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setClaimingId(null);
    }
  }

  const list = tasks ?? [];
  const waiting = list.filter((t) => t.assignees.length === 0);
  const claimed = list.filter((t) => t.assignees.length > 0);
  const groups = user?.groups ?? [];
  const title = groups.length === 1 ? GROUP_LABEL[groups[0]] : 'Việc nhóm chờ nhận';

  // Cùng lớp lỗi đã sửa ở MyTasksScreen/DeliveryScreen: trước
  // khi tải xong lần đầu, màn này chớp qua câu rỗng "chưa có việc nào chờ"
  // Cần khung xám, không phải khuôn rỗng, trong lúc đang tải.
  if (tasks === null && !error) {
    return (
      <View style={styles.container}>
        <View style={{ padding: space.md }}>
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: space.md, flexGrow: 1 }}
      data={waiting}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        error || claimed.length > 0 ? null : (
          <View style={styles.empty}>
            <Text variant="bodyLarge" style={styles.emptyText}>
              {groups.length <= 1 && groups[0] === 'do'
                ? 'Không có nhà nào chờ đo.'
                : `${title} chưa có việc nào chờ. Nghỉ tay chút.`}
            </Text>
          </View>
        )
      }
      ListHeaderComponent={
        <>
          {error && (
            <Banner visible icon={ErrorIcon} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: load }]} style={styles.banner}>
              Mất kết nối — đang thử lại
            </Banner>
          )}
          {claimError && (
            <Banner
              visible
              icon={ErrorIcon}
              style={styles.banner}
              actions={[{ label: 'Đóng', onPress: () => setClaimError(null) }]}
            >
              {claimError}
            </Banner>
          )}
          {waiting.length > 0 && (
            <Text variant="labelLarge" style={styles.sec}>
              {title} — {waiting.length} việc chờ, ai rảnh thì nhận
            </Text>
          )}
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.waitingRow}>
          <TaskRow
            task={item}
            title={item.order ? `${item.order.customer.name} — ${item.order.description}` : item.content}
            metaParts={[
              item.step ? STEP_LABEL[item.step] : null,
              groups.length > 1 && item.step ? GROUP_LABEL[STEP_GROUP[item.step]!] : null,
              item.step === 'do' && item.order ? item.order.customer.address : null,
            ]}
            showStatus={false}
            onPress={() => onOpenTask(item.id)}
          />
          <Button
            mode="contained"
            onPress={() => handleClaim(item)}
            loading={claimingId === item.id}
            disabled={!!claimingId}
            contentStyle={{ height: tapMin }}
            style={styles.claimButton}
          >
            {item.step === 'do' ? 'Tôi đi đo nhà này' : 'Nhận việc này'}
          </Button>
        </View>
      )}
      ListFooterComponent={
        claimed.length > 0 ? (
          <>
            <Text variant="labelLarge" style={[styles.sec, styles.secOk]}>
              Đang có người làm
            </Text>
            {claimed.map((item) => (
              <TaskRow
                key={item.id}
                task={item}
                title={item.order ? `${item.order.customer.name} — ${item.order.description}` : item.content}
                metaParts={[item.step ? STEP_LABEL[item.step] : null, item.assignees.map((a) => a.user.name).join(', ')]}
                onPress={() => onOpenTask(item.id)}
              />
            ))}
          </>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  emptyText: { textAlign: 'center', color: colors.onSurfaceVariant },
  sec: { color: colors.onSurfaceVariant, marginBottom: space.sm, marginTop: space.sm },
  secOk: { color: colors.tertiary },
  waitingRow: { marginBottom: space.sm },
  claimButton: { borderRadius: shape.small, marginTop: space.xs },
});
