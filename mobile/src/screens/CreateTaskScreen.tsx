import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Checkbox, List, Text, TextInput } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';
import type { WorkerListItem } from '../api/types';
import { colors, space } from '../theme/tokens';

export interface CreateTaskPrefill {
  content?: string;
  dueAt?: string | null; // yyyy-MM-dd
  assigneeId?: string | null;
}

// Nháp CHƯA GỬI, không phải "việc" — không phạm ARCHITECTURE.md §10 "không lưu việc
// xuống máy" (điều đó nói về bản ghi đã tồn tại). Xoá ngay sau khi giao việc thành công.
// Dogfood pha I vòng 2 (edge + rushed): bị hệ điều hành force-stop giữa lúc gõ dở ở S3
// làm mất trắng nội dung, phải gõ lại từ đầu — nhất là khi chủ xưởng rất bận, bị cắt
// ngang liên tục (`PERSONAS.md §1`).
const DRAFT_KEY = 'workshop-app.create-task-draft';

interface Draft {
  content: string;
  dueAt: string;
  assigneeIds: string[];
}

async function loadDraft(): Promise<Draft | null> {
  const raw = Platform.OS === 'web' ? localStorage.getItem(DRAFT_KEY) : await SecureStore.getItemAsync(DRAFT_KEY);
  return raw ? (JSON.parse(raw) as Draft) : null;
}

async function saveDraft(draft: Draft) {
  const raw = JSON.stringify(draft);
  if (Platform.OS === 'web') {
    localStorage.setItem(DRAFT_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(DRAFT_KEY, raw);
}

async function clearDraft() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(DRAFT_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(DRAFT_KEY);
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
  const [usersError, setUsersError] = useState<string | null>(null);
  const [dueAtError, setDueAtError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const draftLoaded = useRef(!!prefill); // có prefill (từ giọng nói) thì bỏ qua nháp cũ

  // Khôi phục nháp CHỈ khi vào màn không kèm prefill (tức đường "Gõ tay" thẳng, không phải
  // vừa nói xong) — nói mới luôn là ý định mới nhất, không nên bị nháp cũ ghi đè.
  useEffect(() => {
    if (draftLoaded.current) return;
    loadDraft().then((draft) => {
      if (draft) {
        setContent(draft.content);
        setDueAt(draft.dueAt);
        setSelected(new Set(draft.assigneeIds));
      }
      draftLoaded.current = true;
    });
  }, []);

  // Lưu nháp mỗi khi đổi nội dung/hạn/người chọn — chỉ sau khi đã khôi phục xong (tránh
  // ghi đè nháp cũ bằng state rỗng lúc mới mount).
  useEffect(() => {
    if (!draftLoaded.current) return;
    if (!content.trim() && !dueAt.trim() && selected.size === 0) {
      clearDraft();
      return;
    }
    saveDraft({ content, dueAt, assigneeIds: Array.from(selected) });
  }, [content, dueAt, selected]);

  // Danh sách người để chọn giao — dùng chung endpoint /users (owner), lọc mảng may vá bên dưới.
  // Khung xám khi tải (DESIGN-SYSTEM.md §5) giữ đúng chỗ: dogfood pha I vòng 2
  // phát hiện danh sách rỗng lúc mới vào rồi bất ngờ đổ 10 dòng ra làm
  // bố cục nhảy, khiến người bấm nhanh theo vị trí cũ trúng nhầm dòng/nút khác. Retry riêng
  // (không dùng chung nút "Thử lại" của handleSubmit — vai edge phát hiện bấm Thử lại lúc
  // lỗi tải danh sách chỉ gọi lại handleSubmit, no-op vì chưa chọn được ai nên không tải lại gì).
  function fetchUsers() {
    setUsersLoading(true);
    setUsersError(null);
    api
      .get<WorkerListItem[]>('/users')
      .then(setWorkers)
      .catch(() => setUsersError('Không tải được danh sách người.'))
      .finally(() => setUsersLoading(false));
  }

  useEffect(fetchUsers, []);

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
    // Banner (C5) phải "bám mép trên" (DESIGN-SYSTEM.md §4) — dogfood pha I vòng 2
    // phát hiện banner nằm TRONG ScrollView nên cuộn trôi mất khỏi
    // tầm nhìn. Tách banner ra ngoài ScrollView, đứng yên ở đầu màn, không cuộn theo.
    <View style={styles.outer}>
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
      {usersError && (
        <Banner visible icon="alert-circle" style={styles.errorBanner} actions={[{ label: 'Thử lại', onPress: fetchUsers }]}>
          {usersError}
        </Banner>
      )}
      <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <Text variant="titleLarge" style={styles.title}>
        Xem lại rồi giao
      </Text>
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
        {usersLoading
          ? [0, 1, 2].map((i) => <View key={i} style={styles.itemSkeleton} />)
          : mayVaWorkers.map((w) => (
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
        disabled={sending || usersLoading || !content.trim() || selected.size === 0}
        style={styles.button}
        contentStyle={{ height: 64 }}
      >
        {sending ? 'Đang gửi…' : 'Giao việc'}
      </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, backgroundColor: colors.surface },
  title: { marginBottom: space.md },
  successBanner: { backgroundColor: colors.tertiaryContainer, marginBottom: space.xs },
  errorBanner: { backgroundColor: colors.errorContainer, marginBottom: space.xs },
  input: { marginBottom: space.md },
  fieldError: { color: colors.error, marginTop: -space.sm, marginBottom: space.md },
  label: { marginBottom: space.sm },
  list: { marginBottom: space.lg, backgroundColor: colors.surfaceContainer, borderRadius: 12 },
  itemSelected: { backgroundColor: colors.primaryContainer },
  itemSkeleton: {
    height: 64,
    margin: space.sm,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainerHigh,
  },
  button: { borderRadius: 999 },
});
