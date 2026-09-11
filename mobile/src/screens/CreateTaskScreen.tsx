import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Checkbox, List, Text, TextInput } from 'react-native-paper';
import { api } from '../api/client';
import type { WorkerListItem } from '../api/types';
import { colors, space } from '../theme/tokens';

export interface CreateTaskPrefill {
  content?: string;
  dueAt?: string | null; // yyyy-MM-dd
  assigneeId?: string | null;
}

// S3 — "Xem lại rồi giao" (PROTOTYPE.md §1). AC-2/AC-3 (gõ tay, vòng 1) +
// AC-6/AC-7 (từ giọng nói, vòng 2 — nhận prefill qua props, người dùng luôn soát
// và sửa được trước khi chạm "Giao việc", không có đường phát việc thẳng).
export function CreateTaskScreen({ onDone, prefill }: { onDone: () => void; prefill?: CreateTaskPrefill }) {
  const [content, setContent] = useState(prefill?.content ?? '');
  const [dueAt, setDueAt] = useState(prefill?.dueAt ?? '');
  const [workers, setWorkers] = useState<WorkerListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(prefill?.assigneeId ? [prefill.assigneeId] : []),
  );
  const [error, setError] = useState<string | null>(null);
  const [dueAtError, setDueAtError] = useState<string | null>(null);
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

  function validateDueAt(value: string): string | null {
    if (!value.trim()) return null; // hạn là tuỳ chọn
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return 'Nhập theo dạng NĂM-THÁNG-NGÀY, ví dụ 2026-09-18.';
    return null;
  }

  async function handleSubmit() {
    const dueErr = validateDueAt(dueAt);
    setDueAtError(dueErr);
    if (!content.trim() || selected.size === 0 || dueErr) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/tasks', {
        content: content.trim(),
        assigneeIds: Array.from(selected),
        dueAt: dueAt.trim() ? dueAt.trim() : undefined,
      });
      const names = workers.filter((w) => selected.has(w.id)).map((w) => w.name).join(', ');
      setBanner(`Đã giao việc cho ${names}. Điện thoại của họ vừa rung.`);
      setContent('');
      setDueAt('');
      setSelected(new Set());
      // Giữ banner đủ lâu để đọc trước khi quay về home — không cắt ngang
      // ngay lập tức (bug dogfood pha I: quay về home mà không thấy xác nhận gì).
      setTimeout(onDone, 1500);
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
        Xem lại rồi giao
      </Text>
      {banner && (
        <Banner visible icon="check-circle" style={styles.successBanner}>
          {banner}
        </Banner>
      )}
      {error && (
        <Banner visible icon="alert-circle" style={styles.errorBanner} actions={[{ label: 'Thử lại', onPress: handleSubmit }]}>
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
      <TextInput
        label="Giao ngày nào (bỏ trống nếu chưa rõ)"
        mode="outlined"
        placeholder="2026-09-18"
        value={dueAt}
        onChangeText={(v) => {
          setDueAt(v);
          if (dueAtError) setDueAtError(null);
        }}
        error={!!dueAtError}
        style={styles.input}
      />
      {dueAtError && (
        <Text variant="bodySmall" style={styles.fieldError}>
          {dueAtError}
        </Text>
      )}
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
  fieldError: { color: colors.error, marginTop: -space.sm, marginBottom: space.md },
  label: { marginBottom: space.sm },
  list: { marginBottom: space.lg, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  itemSelected: { backgroundColor: colors.primaryContainer },
  button: { borderRadius: 999 },
});
