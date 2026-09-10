import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Checkbox, List, Text, TextInput } from 'react-native-paper';
import { api } from '../api/client';
import type { WorkerListItem } from '../api/types';
import { colors, space } from '../theme/tokens';

// S3 — "Xem lại rồi giao", bản gõ tay (PROTOTYPE.md §1; giọng nói là vòng 2).
// AC-2 (tạo việc) + AC-3 (giao nhiều người một việc).
export function CreateTaskScreen({ onDone }: { onDone: () => void }) {
  const [content, setContent] = useState('');
  const [workers, setWorkers] = useState<WorkerListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    // Danh sách người để chọn giao — dùng chung endpoint /users (owner), lọc mảng may vá bên dưới.
    api.get<WorkerListItem[]>('/users').then(setWorkers).catch(() => setError('Không tải được danh sách người.'));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!content.trim() || selected.size === 0) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/tasks', { content: content.trim(), assigneeIds: Array.from(selected) });
      const names = workers.filter((w) => selected.has(w.id)).map((w) => w.name).join(', ');
      setBanner(`Đã giao việc cho ${names}. Điện thoại của họ vừa rung.`);
      setContent('');
      setSelected(new Set());
      onDone();
    } catch {
      setError('Không giao được việc — thử lại.');
    } finally {
      setSending(false);
    }
  }

  const mayVaWorkers = workers.filter((w) => w.role === 'worker' && w.line === 'may_va');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <Text variant="titleLarge" style={styles.title}>
        Tạo việc
      </Text>
      {banner && (
        <Banner visible icon="check-circle" style={styles.successBanner}>
          {banner}
        </Banner>
      )}
      {error && (
        <Banner visible icon="alert-circle" style={styles.errorBanner}>
          {error}
        </Banner>
      )}
      <TextInput
        label="Nội dung việc"
        mode="outlined"
        value={content}
        onChangeText={setContent}
        multiline
        style={styles.input}
      />
      <Text variant="bodyLarge" style={styles.label}>
        Giao cho
      </Text>
      <View style={styles.list}>
        {mayVaWorkers.map((w) => (
          <List.Item
            key={w.id}
            title={w.name}
            onPress={() => toggle(w.id)}
            style={selected.has(w.id) ? styles.itemSelected : undefined}
            left={() => (
              <Checkbox status={selected.has(w.id) ? 'checked' : 'unchecked'} onPress={() => toggle(w.id)} />
            )}
          />
        ))}
      </View>
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={sending}
        disabled={sending || !content.trim() || selected.size === 0}
        style={styles.button}
        contentStyle={{ height: 64 }}
      >
        {sending ? 'Đang gửi…' : 'Giao việc'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { marginBottom: space.md },
  successBanner: { marginBottom: space.md, backgroundColor: colors.tertiaryContainer },
  errorBanner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  input: { marginBottom: space.md },
  label: { marginBottom: space.sm },
  list: { marginBottom: space.lg, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  itemSelected: { backgroundColor: colors.primaryContainer },
  button: { borderRadius: 999 },
});
