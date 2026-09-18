import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { StatusChip } from '../tasks/StatusChip';
import { actionEndpoint, actionLabel, formatTime, nextAction } from '../tasks/taskStatus';
import { formatMeasurements, modeLabel, pillowSummary } from '../orders/orderStatus';
import { takePhotoAsBase64 } from '../orders/pickPhoto';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';

// CAP-DEM-02 (AC-19) — S20 "Số đo": khi việc đang mở là bước "đi đo" (step='do') và CHƯA
// xong, TaskDetailScreen (= S29 tái dùng) đổi thành form nhập số đo/ảnh ngay tại đây thay
// vì màn riêng — đúng tinh thần "tái dùng tối đa" của `_PROPOSAL.md`. Lưu nháp qua
// PATCH /orders/:id/measurements PHẢI luôn thành công dù thiếu số (S20 rỗng: "chụp tờ giấy
// đo là đủ") — chỉ "Xong" mới đòi ảnh nếu bộ khó (chặn ở server, tasks.service.ts).
function MeasurementEditor({
  task,
  onSaved,
}: {
  task: Task;
  onSaved: (updated: { measurementPhoto: string | null }) => void;
}) {
  const order = task.order!;
  const [length, setLength] = useState(order.measurementLength?.toString() ?? '');
  const [depth, setDepth] = useState(order.measurementDepth?.toString() ?? '');
  const [width, setWidth] = useState(order.measurementWidth?.toString() ?? '');
  const [thickness, setThickness] = useState(order.measurementThickness?.toString() ?? '');
  const [photo, setPhoto] = useState<string | null>(order.measurementPhoto);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function toNumber(v: string): number | undefined {
    const n = Number(v.trim());
    return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  }

  async function save(nextPhoto?: string | null) {
    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/orders/${order.id}/measurements`, {
        measurementLength: toNumber(length),
        measurementDepth: toNumber(depth),
        measurementWidth: toNumber(width),
        measurementThickness: toNumber(thickness),
        measurementPhoto: nextPhoto !== undefined ? nextPhoto : photo,
      });
      onSaved({ measurementPhoto: nextPhoto !== undefined ? nextPhoto : photo });
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTakePhoto() {
    const dataUri = await takePhotoAsBase64();
    if (!dataUri) return;
    setPhoto(dataUri);
    await save(dataUri);
  }

  return (
    <View style={styles.orderBlock}>
      {modeLabel(order.mode) && <Text style={styles.buonTag}>{modeLabel(order.mode)}</Text>}
      <Text variant="bodyLarge" style={styles.meta}>
        {order.customer.name} · {order.customer.phone}
      </Text>
      <Text variant="bodyLarge" style={styles.meta}>
        {order.customer.address}
      </Text>
      {order.difficulty === 'kho' && (
        <Text style={styles.hardTag}>Bộ khó — bắt buộc chụp ảnh tờ đo trước khi báo xong</Text>
      )}
      {saveError && (
        <Banner visible icon="alert-circle" style={styles.banner}>
          {saveError}
        </Banner>
      )}
      <Button
        mode={photo ? 'outlined' : 'contained'}
        onPress={handleTakePhoto}
        loading={saving}
        contentStyle={{ height: tapMin }}
        style={styles.button}
      >
        {photo ? 'Chụp lại ảnh tờ đo' : 'Chụp ảnh tờ đo'}
      </Button>
      {photo && <Image source={{ uri: photo }} style={styles.photo} />}
      <View style={styles.measureRow}>
        <TextInput
          label="Dài"
          mode="outlined"
          keyboardType="numeric"
          value={length}
          onChangeText={setLength}
          onBlur={() => save()}
          style={styles.measureInput}
        />
        <TextInput
          label="Sâu"
          mode="outlined"
          keyboardType="numeric"
          value={depth}
          onChangeText={setDepth}
          onBlur={() => save()}
          style={styles.measureInput}
        />
      </View>
      <View style={styles.measureRow}>
        <TextInput
          label="Ngang"
          mode="outlined"
          keyboardType="numeric"
          value={width}
          onChangeText={setWidth}
          onBlur={() => save()}
          style={styles.measureInput}
        />
        <TextInput
          label="Dày (ghế thấp)"
          mode="outlined"
          keyboardType="numeric"
          value={thickness}
          onChangeText={setThickness}
          onBlur={() => save()}
          style={styles.measureInput}
        />
      </View>
    </View>
  );
}

// S7 — chi tiết việc. CAP-TASK-11/12/13 (AC-8/9/10): một nút lớn theo đúng trạng thái hiện
// tại. CAP-TASK-09 (AC-11): khối "Việc này đã đi qua" hiện mốc thời gian ngầm, tự ghi.
export function TaskDetailScreen({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Task>(`/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setError(false);
      })
      .catch(() => setError(true));
  }, [taskId]);

  useFocusEffect(load);

  async function handleAction() {
    if (!task) return;
    const action = nextAction(task.status);
    if (!action || submitting) return; // đang gửi — khoá, chống bấm hai lần (ARCHITECTURE.md §6)
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await api.patch<Task>(actionEndpoint(task.id, action));
      if (user) track(`viec_${action}`, user.id, { taskId: task.id });
      setTask(updated);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Mất kết nối — thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Banner visible icon="alert-circle" style={styles.banner}>
          Không tải được việc này.
        </Banner>
      </View>
    );
  }

  if (!task) return <View style={styles.container} />;

  const isMeasuring = task.line === 'dem' && task.step === 'do' && task.status !== 'done' && !!task.order;
  const action = nextAction(task.status);
  const ackAt = task.events.find((e) => e.kind === 'acked')?.at;
  const startAt = task.events.find((e) => e.kind === 'started')?.at;
  const doneAt = task.events.find((e) => e.kind === 'done')?.at;
  // AC-11 — việc mảng bạt đi qua thêm bước "chia" (điều phối giao từ hàng đợi, ARCHITECTURE.md
  // §7 luồng B) trước khi tới "nhận". Việc may vá giao thẳng, không có bước này.
  const assignedAt =
    task.line === 'bat' && task.assignees.length > 0
      ? task.assignees.map((a) => a.assignedAt).sort()[0]
      : undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      {actionError && (
        <Banner
          visible
          icon="alert-circle"
          style={styles.banner}
          actions={[{ label: 'Đóng', onPress: () => setActionError(null) }]}
        >
          {actionError}
        </Banner>
      )}
      {task.measurements && (
        <Text variant="headlineSmall" style={styles.measurements}>
          {task.measurements}
        </Text>
      )}
      {/* vòng 7 (S29 tái dùng màn này, DECISIONS.md) — khối riêng của mảng đệm: số đo,
          khách, gối, khu vực. CỐ Ý không có giá/cọc — `task.order` không mang field đó
          (TASK_INCLUDE.order, tasks.service.ts). Bước "đi đo" chưa xong → form nhập
          (MeasurementEditor, CAP-DEM-02); mọi bước khác → chỉ đọc. */}
      {isMeasuring && task.order && (
        <MeasurementEditor task={task} onSaved={(u) => setTask({ ...task, order: { ...task.order!, ...u } })} />
      )}
      {!isMeasuring && task.order && (
        <View style={styles.orderBlock}>
          {modeLabel(task.order.mode) && <Text style={styles.buonTag}>{modeLabel(task.order.mode)}</Text>}
          <Text variant="bodyLarge" style={styles.meta}>
            Khách: {task.order.customer.name} · {task.order.customer.phone}
          </Text>
          <Text variant="bodyLarge" style={styles.meta}>
            {task.order.customer.address}
            {task.order.route ? ` · ${task.order.route.name}` : ''}
          </Text>
          {task.order.difficulty === 'kho' && <Text style={styles.hardTag}>Bộ khó</Text>}
          {formatMeasurements(task.order) && (
            <Text variant="headlineSmall" style={styles.measurements}>
              {formatMeasurements(task.order)}
            </Text>
          )}
          {task.order.measurementPhoto && (
            <Image source={{ uri: task.order.measurementPhoto }} style={styles.photo} />
          )}
          {pillowSummary(task.order.pillows) && (
            <Text variant="bodyLarge" style={styles.meta}>
              Gối kèm: {pillowSummary(task.order.pillows)}
            </Text>
          )}
        </View>
      )}
      <Text variant="titleLarge" style={styles.content}>
        {task.content}
      </Text>
      {task.dueAt && (
        <Text variant="bodyLarge" style={styles.meta}>
          Hạn: {new Date(task.dueAt).toLocaleDateString('vi-VN')}
        </Text>
      )}
      <Text variant="bodyLarge" style={styles.meta}>
        Giao cho: {task.assignees.map((a) => a.user.name).join(', ')}
      </Text>
      <View style={styles.chipRow}>
        <StatusChip task={task} />
      </View>

      {action && (
        <Button
          mode="contained"
          onPress={handleAction}
          loading={submitting}
          disabled={submitting}
          contentStyle={{ height: tapMin }}
          style={styles.actionButton}
        >
          {submitting ? 'Đang gửi…' : actionLabel(action)}
        </Button>
      )}

      <Text variant="labelLarge" style={styles.sec}>
        Việc này đã đi qua
      </Text>
      <Text variant="bodyLarge" style={styles.time}>
        Giao việc · {formatTime(task.createdAt)}
        {assignedAt && (
          <>
            {'\n'}
            Chia cho bạn · {formatTime(assignedAt)}
          </>
        )}
        {'\n'}
        Nhận việc · {ackAt ? formatTime(ackAt) : 'chưa có'}
        {'\n'}
        Bắt đầu làm · {startAt ? formatTime(startAt) : 'chưa có'}
        {'\n'}
        Xong · {doneAt ? formatTime(doneAt) : 'chưa có'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md, backgroundColor: colors.surface },
  banner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  measurements: { marginBottom: space.md, color: colors.primary },
  orderBlock: {
    marginBottom: space.md,
    padding: space.md,
    borderRadius: shape.small,
    backgroundColor: colors.surfaceContainer,
    gap: space.xs,
  },
  buonTag: {
    alignSelf: 'flex-start',
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  hardTag: { color: colors.error, fontWeight: '700' },
  photo: { width: '100%', height: 160, borderRadius: shape.small, marginTop: space.xs },
  button: { borderRadius: shape.small, marginTop: space.xs },
  measureRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  measureInput: { flex: 1 },
  content: { marginBottom: space.sm },
  meta: { marginTop: space.xs, color: colors.onSurfaceVariant },
  chipRow: { marginTop: space.md },
  actionButton: { borderRadius: shape.small, marginTop: space.md },
  sec: { color: colors.onSurfaceVariant, marginTop: space.lg, marginBottom: space.sm },
  time: { color: colors.onSurfaceVariant, lineHeight: 32 },
});
