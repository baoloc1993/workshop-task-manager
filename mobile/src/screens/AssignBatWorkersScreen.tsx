import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Checkbox, List, Text } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { BatWorkerItem, Task } from '../api/types';
import { colors, fontSize, space, tapMin } from '../theme/tokens';

// S10 — "Chọn thợ để giao" (PROTOTYPE.md §1). CAP-TASK-06 (AC-13): điều phối (hoặc chủ xưởng)
// chọn 1..n thợ bạt ĐANG HOẠT ĐỘNG. Chọn lại một việc đã chia thì GHI ĐÈ toàn bộ danh sách
// cũ, không cộng dồn (ARCHITECTURE.md §6 "Sửa đồng thời" — bản ghi sau thắng; DECISIONS.md
// vòng 4).
export function AssignBatWorkersScreen({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [workers, setWorkers] = useState<BatWorkerItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([api.get<Task>(`/tasks/${taskId}`), api.get<BatWorkerItem[]>('/users/bat-workers')])
      .then(([t, w]) => {
        setTask(t);
        setWorkers(w);
        setSelected(new Set(t.assignees.map((a) => a.userId)));
      })
      .catch(() => setLoadError(true));
  }, [taskId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (selected.size === 0 || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await api.post(`/tasks/${taskId}/assign`, { userIds: Array.from(selected) });
      onDone();
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <Banner visible icon="alert-circle" actions={[{ label: 'Thử lại', onPress: load }]} style={styles.banner}>
          Không tải được việc này.
        </Banner>
      </View>
    );
  }

  if (!task) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {sendError && (
        <Banner
          visible
          icon="alert-circle"
          style={styles.banner}
          actions={[{ label: 'Thử lại', onPress: handleAssign }]}
        >
          {sendError}
        </Banner>
      )}
      {task.measurements && <Text style={styles.measure}>{task.measurements}</Text>}
      <Text variant="titleLarge" style={styles.content}>
        {task.content}
      </Text>
      {task.dueAt && (
        <Text variant="bodyLarge" style={styles.due}>
          Hạn: {new Date(task.dueAt).toLocaleDateString('vi-VN')}
        </Text>
      )}
      <Text variant="bodyLarge" style={styles.label}>
        Chọn thợ
      </Text>
      <View style={styles.list}>
        {workers.length === 0 ? (
          <Text variant="bodyLarge" style={styles.emptyText}>
            Không còn thợ bạt nào đang làm.
          </Text>
        ) : (
          workers.map((w) => (
            <List.Item
              key={w.id}
              title={w.name}
              description={`Đang giữ ${w.activeTaskCount} việc`}
              onPress={() => toggle(w.id)}
              style={selected.has(w.id) ? styles.itemSelected : undefined}
              left={() => (
                <Checkbox status={selected.has(w.id) ? 'checked' : 'unchecked'} onPress={() => toggle(w.id)} />
              )}
            />
          ))
        )}
      </View>
      <Button
        mode="contained"
        onPress={handleAssign}
        loading={sending}
        disabled={sending || selected.size === 0}
        style={styles.button}
        contentStyle={{ height: tapMin }}
      >
        {sending ? 'Đang giao…' : 'Giao'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  measure: { fontSize: fontSize.headline, color: colors.primary, fontWeight: '600', marginBottom: space.md },
  content: { marginBottom: space.sm },
  due: { color: colors.onSurfaceVariant, marginBottom: space.sm },
  label: { marginBottom: space.sm, marginTop: space.md },
  list: { marginBottom: space.lg, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  itemSelected: { backgroundColor: colors.primaryContainer },
  emptyText: { padding: space.md, color: colors.onSurfaceVariant },
  button: { borderRadius: 999 },
});
