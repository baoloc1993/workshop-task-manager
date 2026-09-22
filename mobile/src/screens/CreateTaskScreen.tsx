import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Chip, List, RadioButton, Text, TextInput } from 'react-native-paper';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';
import type { WorkerListItem } from '../api/types';
import { chipHitSlop, colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { track } from '../analytics/track';
import { isMayVaAssignee } from '../tasks/assignees';
import { useAuth } from '../auth/AuthContext';
import { KeyboardAvoider } from '../common/KeyboardAvoider';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';

export interface CreateTaskPrefill {
  content?: string;
  dueAt?: string | null; // yyyy-MM-dd
  assigneeId?: string | null;
  line?: 'may_va' | 'bat'; // CAP-TASK-06 (vòng 4)
  measurements?: string | null; // CAP-TASK-05 (vòng 4) — chỉ có ý nghĩa khi line='bat'
  // AC-38 (vòng 9) — người gần đúng từ giọng nói (voice/matchAssignees.ts), tối đa 3, gần
  // nhất trước. Chỉ để HIỆN chip gợi ý — không bao giờ tự tick.
  suggestedAssigneeIds?: string[];
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
  batGroup: boolean;
  measurements: string;
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
  const { user } = useAuth();
  const [content, setContent] = useState(prefill?.content ?? '');
  const [dueAt, setDueAt] = useState(prefill?.dueAt ?? '');
  const [workers, setWorkers] = useState<WorkerListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(prefill?.assigneeId ? [prefill.assigneeId] : []),
  );
  // S3 (PROTOTYPE.md §1): "Nhóm bạt (điều phối chia tiếp)" là MỘT HÀNG trong đúng danh sách
  // "Giao cho" — không phải bộ chọn mảng riêng — loại trừ lẫn nhau với chọn người may vá.
  const [batGroup, setBatGroup] = useState(prefill?.line === 'bat');
  const [measurements, setMeasurements] = useState(prefill?.measurements ?? '');
  const line: 'may_va' | 'bat' = batGroup ? 'bat' : 'may_va';
  const [error, setError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [dueAtError, setDueAtError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const draftLoaded = useRef(!!prefill); // có prefill (từ giọng nói) thì bỏ qua nháp cũ
  // AC-25 (vòng 8, CAP-BUG-02) — trước đây khôi phục nháp cũ ÂM THẦM, không có tín hiệu gì
  // cho người dùng biết nội dung đang gõ là của LẦN TRƯỚC — dễ tưởng nhầm là màn trống rồi
  // gõ đè lên. Banner báo rõ + nút xoá riêng (DECISIONS.md 2026-09-19: "giữ nháp, thêm banner").
  const [hasOldDraft, setHasOldDraft] = useState(false);

  // Khôi phục nháp CHỈ khi vào màn không kèm prefill (tức đường "Gõ tay" thẳng, không phải
  // vừa nói xong) — nói mới luôn là ý định mới nhất, không nên bị nháp cũ ghi đè.
  useEffect(() => {
    if (draftLoaded.current) return;
    loadDraft().then((draft) => {
      if (draft) {
        setContent(draft.content);
        setDueAt(draft.dueAt);
        setSelected(new Set(draft.assigneeIds));
        setBatGroup(draft.batGroup ?? false); // nháp cũ (vòng 1-3) chưa có field này
        setMeasurements(draft.measurements ?? '');
        setHasOldDraft(true);
      }
      draftLoaded.current = true;
    });
  }, []);

  function discardDraft() {
    clearDraft();
    setContent('');
    setDueAt('');
    setSelected(new Set());
    setBatGroup(false);
    setMeasurements('');
    setHasOldDraft(false);
  }

  // Lưu nháp mỗi khi đổi nội dung/hạn/người chọn/mảng/số đo — chỉ sau khi đã khôi phục xong
  // (tránh ghi đè nháp cũ bằng state rỗng lúc mới mount).
  useEffect(() => {
    if (!draftLoaded.current) return;
    if (!content.trim() && !dueAt.trim() && selected.size === 0 && !batGroup && !measurements.trim()) {
      clearDraft();
      return;
    }
    saveDraft({ content, dueAt, assigneeIds: Array.from(selected), batGroup, measurements });
  }, [content, dueAt, selected, batGroup, measurements]);

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

  // Chọn người may vá thì bỏ chọn "Nhóm bạt" — một việc chỉ đi một đường (ARCHITECTURE.md
  // §6: `line` là một giá trị duy nhất trên `Task`, không thể vừa giao đích danh vừa vào
  // "Việc bạt chờ chia").
  function toggle(id: string) {
    setBatGroup(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleBatGroup() {
    setBatGroup((prev) => {
      const next = !prev;
      if (next) setSelected(new Set());
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
    if (!content.trim() || dueErr) return;
    if (line === 'may_va' && selected.size === 0) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/tasks', {
        content: content.trim(),
        dueAt: dueAt.trim() ? dueAt.trim() : undefined,
        line,
        // CAP-TASK-06 (AC-13): việc mảng bạt luôn tạo không có assignee, rơi vào
        // "Việc bạt chờ chia" tới khi điều phối/chủ xưởng giao qua S10.
        ...(line === 'bat'
          ? { measurements: measurements.trim() ? measurements.trim() : undefined }
          : { assigneeIds: Array.from(selected) }),
      });
      // Nhóm 4 production-ready — "hoàn tất luồng lõi" phía owner (H3, PRD.md §6).
      if (user) track('giao_viec', user.id, { line });
      setBanner(
        line === 'bat'
          ? 'Đã giao việc cho nhóm bạt. Điều phối sẽ chia cho thợ.'
          : `Đã giao việc cho ${workers.filter((w) => selected.has(w.id)).map((w) => w.name).join(', ')}. Điện thoại của họ vừa rung.`,
      );
      setContent('');
      setDueAt('');
      setSelected(new Set());
      setBatGroup(false);
      setMeasurements('');
      setHasOldDraft(false);
      // Giữ banner đủ lâu để đọc trước khi quay về home — không cắt ngang
      // ngay lập tức (bug dogfood pha I: quay về home mà không thấy xác nhận gì).
      setTimeout(onDone, 1500);
    } catch {
      setError('Không giao được việc — thử lại.');
    } finally {
      setSending(false);
    }
  }

  const mayVaWorkers = workers.filter(isMayVaAssignee);
  // AC-38 — giữ đúng thứ tự gợi ý (gần nhất trước), bỏ người không còn trong danh sách.
  const suggested = (prefill?.suggestedAssigneeIds ?? [])
    .map((id) => mayVaWorkers.find((w) => w.id === id))
    .filter((w): w is WorkerListItem => !!w)
    .slice(0, 3);

  // Chạm chip gợi ý = CHỌN người đó (không bỏ chọn nếu đã chọn — chip là lối tắt tới hàng
  // C9 bên dưới, bỏ chọn thì chạm hàng đó).
  function pickSuggested(id: string) {
    if (selected.has(id)) return;
    toggle(id);
  }

  return (
    // Banner (C5) phải "bám mép trên" (DESIGN-SYSTEM.md §4) — dogfood pha I vòng 2
    // phát hiện banner nằm TRONG ScrollView nên cuộn trôi mất khỏi
    // tầm nhìn. Tách banner ra ngoài ScrollView, đứng yên ở đầu màn, không cuộn theo.
    <KeyboardAvoider>
    <View style={styles.outer}>
      {hasOldDraft && (
        // picky vòng 9 (L1): chữ "Xoá" --color-primary trên nền surface-container-high chỉ 4.16:1 và
        // vùng chạm 41×38dp — đổi sang on-primary-container (~8:1) + bannerActionStyle (≥48dp).
        <Banner
          visible
          icon="pencil"
          style={styles.draftBanner}
          actions={[{ ...bannerActionStyle, label: 'Xoá', textColor: colors.onPrimaryContainer, onPress: discardDraft }]}
        >
          Đang tiếp tục nháp trước đó — Xoá để bắt đầu mới
        </Banner>
      )}
      {banner && (
        <Banner visible icon="check-circle" style={styles.successBanner}>
          {banner}
        </Banner>
      )}
      {error && (
        <Banner visible icon={ErrorIcon} style={styles.errorBanner} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: handleSubmit }]}>
          {error}
        </Banner>
      )}
      {usersError && (
        <Banner visible icon={ErrorIcon} style={styles.errorBanner} actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: fetchUsers }]}>
          {usersError}
        </Banner>
      )}
      <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <Text variant="titleLarge" style={styles.title}>
        Xem lại rồi giao
      </Text>
      {batGroup && (
        <View style={styles.measureBlock}>
          <Text variant="labelLarge" style={styles.measureLabel}>
            Số đo
          </Text>
          <TextInput
            mode="flat"
            value={measurements}
            onChangeText={setMeasurements}
            placeholder="Nhập số đo"
            multiline
            underlineColor="transparent"
            activeUnderlineColor="transparent"
            style={styles.measureInput}
            contentStyle={styles.measureInputContent}
          />
          {!measurements && (
            <Text variant="bodySmall" style={styles.measureHint}>
              Vd. 4 mét 6 nhân 6 mét
            </Text>
          )}
        </View>
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
      {/* AC-38 (vòng 9) — hàng chip "Gợi ý" (C18) ngay trên danh sách người nhận, chỉ hiện
          khi giọng nói có tên gần đúng. Xuống dòng, không cuộn ngang (§4b luật 3). */}
      {!usersLoading && suggested.length > 0 && (
        <View style={styles.suggestBlock}>
          <Text style={styles.suggestLabel}>Gợi ý — có phải bạn nói:</Text>
          <View style={styles.chipRow}>
            {suggested.map((w) => {
              const on = selected.has(w.id);
              return (
                <Chip
                  key={w.id}
                  selected={on}
                  onPress={() => pickSuggested(w.id)}
                  style={[styles.chip, on ? styles.chipSelected : styles.chipUnselected]}
                  textStyle={on ? styles.chipTextSelected : styles.chipTextUnselected}
                  selectedColor={on ? colors.onPrimaryContainer : colors.onSurface}
                  hitSlop={chipHitSlop}
                  accessibilityLabel={`Gợi ý: chọn ${w.name}`}
                >
                  {w.name}
                </Chip>
              );
            })}
          </View>
        </View>
      )}
      {/* C9 (DESIGN-SYSTEM.md §4, AC-27 vòng 8) — "hàng chọn người": vòng tròn bên trái,
          chọn = tô --color-primary. `Checkbox` (ô vuông) trước đây lệch component đã chốt —
          `RadioButton` vẽ đúng hình vòng tròn dù ngữ nghĩa vẫn là chọn nhiều (mỗi hàng bấm
          độc lập, không nhóm loại trừ). */}
      <View style={styles.list}>
        {/* CAP-TASK-06 (AC-13) — "Nhóm bạt" là một hàng chọn trong đúng danh sách này
            (PROTOTYPE.md §1 S3), loại trừ với chọn người may vá bên dưới. */}
        <List.Item
          title="Nhóm bạt (điều phối chia tiếp)"
          onPress={toggleBatGroup}
          style={batGroup ? styles.itemSelected : undefined}
          left={() => (
            <RadioButton value="bat_group" color={colors.primary} status={batGroup ? 'checked' : 'unchecked'} onPress={toggleBatGroup} />
          )}
        />
        {usersLoading
          ? [0, 1, 2].map((i) => <View key={i} style={styles.itemSkeleton} />)
          : mayVaWorkers.map((w) => (
              <List.Item
                key={w.id}
                title={w.name}
                // AC-39 — điều phối nằm chung danh sách, ghi rõ vai để khỏi lẫn với thợ cùng tên.
                description={w.role === 'bat_coordinator' ? 'Điều phối bạt' : undefined}
                onPress={() => toggle(w.id)}
                style={selected.has(w.id) ? styles.itemSelected : undefined}
                left={() => (
                  <RadioButton
                    value={w.id}
                    color={colors.primary}
                    status={selected.has(w.id) ? 'checked' : 'unchecked'}
                    onPress={() => toggle(w.id)}
                  />
                )}
              />
            ))}
      </View>
      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={sending}
        disabled={sending || !content.trim() || (line === 'may_va' && (usersLoading || selected.size === 0))}
        style={styles.button}
        contentStyle={{ height: tapMin }}
      >
        {sending ? 'Đang gửi…' : 'Giao việc'}
      </Button>
      </ScrollView>
    </View>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.surface },
  container: { flex: 1, backgroundColor: colors.surface },
  title: { marginBottom: space.md },
  draftBanner: { backgroundColor: colors.surfaceContainerHigh, marginBottom: space.xs },
  successBanner: { backgroundColor: colors.tertiaryContainer, marginBottom: space.xs },
  errorBanner: { backgroundColor: colors.errorContainer, marginBottom: space.xs },
  input: { marginBottom: space.md },
  // C6 — khối số đo tách riêng, cỡ chữ lớn nhất (`--text-headline`): sai một chữ số ở đây
  // là cắt sai vật tư thật (ARCHITECTURE.md §6, DESIGN-SYSTEM.md §4 C6, prototype `.measure`).
  // Vẫn sửa được (AC-7) nhưng KHÔNG mang khung ô nhập thường (`mode="outlined"`) như các
  // field khác — để không lẫn với C2, đúng tinh thần "tách khối riêng" của C6.
  measureBlock: {
    marginBottom: space.md,
    padding: space.md,
    borderRadius: shape.small,
    backgroundColor: colors.surfaceContainer,
  },
  measureLabel: { color: colors.onSurfaceVariant, marginBottom: space.xs },
  measureInput: { backgroundColor: 'transparent' },
  measureInputContent: { fontSize: fontSize.headline, fontWeight: '700', color: colors.onSurface, paddingHorizontal: 0 },
  measureHint: { color: colors.onSurfaceVariant, marginTop: -space.xs },
  fieldError: { color: colors.error, marginTop: -space.sm, marginBottom: space.md },
  label: { marginBottom: space.sm },
  list: { marginBottom: space.lg, backgroundColor: colors.surfaceContainer, borderRadius: shape.small },
  itemSelected: { backgroundColor: colors.primaryContainer },
  // C18 (DESIGN-SYSTEM.md §4) — cùng khuôn ép màu với AssignGroupsScreen/CreateOrderScreen.
  suggestBlock: { marginBottom: space.sm },
  suggestLabel: { fontSize: fontSize.label, color: colors.onSurfaceVariant, marginBottom: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { marginBottom: space.xs, minHeight: tapMin, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.primaryContainer, borderWidth: 0 },
  chipUnselected: { backgroundColor: 'transparent', borderColor: colors.outline, borderWidth: 1 },
  chipTextSelected: { color: colors.onPrimaryContainer },
  chipTextUnselected: { color: colors.onSurface },
  itemSkeleton: {
    height: tapMin,
    margin: space.sm,
    borderRadius: shape.small,
    backgroundColor: colors.surfaceContainerHigh,
  },
  button: { borderRadius: shape.small },
});
