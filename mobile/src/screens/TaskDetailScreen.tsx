import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import { api, ApiError } from '../api/client';
import type { Task } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { StatusChip } from '../tasks/StatusChip';
import { StatusPill } from '../tasks/StatusPill';
import { actionEndpoint, actionLabel, formatTime, nextAction } from '../tasks/taskStatus';
import { formatMeasurements, modeLabel, pillowSummary } from '../orders/orderStatus';
import { PhotoBox } from '../orders/PhotoBox';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';
import { KeyboardAvoider } from '../common/KeyboardAvoider';
import { LoadErrorBanner } from '../common/LoadErrorBanner';
import { ErrorIcon } from '../common/bannerParts';

// Khi việc đang mở là bước "đi đo" (step='do') và CHƯA
// xong, TaskDetailScreen (= S29 tái dùng) đổi thành form nhập số đo/ảnh ngay tại đây thay
// vì màn riêng — đúng tinh thần "tái dùng tối đa" của dự án. Lưu nháp qua
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
  const loaded = useRef(false);

  function toNumber(v: string): number | undefined {
    const n = Number(v.trim());
    return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
  }

  // (meta): chỉ lưu ở onBlur bị mất dữ liệu thật — gõ xong một ô rồi
  // bấm Back (phần cứng) ngay, không chạm ô khác để kích onBlur, thoát màn mà KHÔNG lưu
  // (xác nhận bằng curl: ô vừa gõ vẫn null sau khi thoát). Lưu tự động sau một nhịp ngắn
  // ngừng gõ, không đợi blur — cùng khuôn "không mất dữ liệu đang nhập".
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    const t = setTimeout(() => save(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length, depth, width, thickness]);

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

  // PhotoBox tự chụp + xem trước, chỉ gọi hàm này khi "Dùng ảnh này".
  async function handleConfirmPhoto(dataUri: string) {
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
        <Banner visible icon={ErrorIcon} style={styles.banner}>
          {saveError}
        </Banner>
      )}
      <PhotoBox
        photo={photo}
        label="Chụp ảnh tờ đo"
        required={order.difficulty === 'kho'}
        onConfirm={handleConfirmPhoto}
      />
      {saving && (
        <Text variant="bodySmall" style={styles.meta}>
          Đang lưu…
        </Text>
      )}
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

// chi tiết việc.: một nút lớn theo đúng trạng thái hiện
// tại.: khối "Việc này đã đi qua" hiện mốc thời gian ngầm, tự ghi.
export function TaskDetailScreen({ taskId }: { taskId: string }) {
  const { user, logout } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  // giữ lỗi gốc để `LoadErrorBanner` phân biệt mất mạng/401/500.
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Task>(`/tasks/${taskId}`)
      .then((t) => {
        setTask(t);
        setError(null);
      })
      .catch((e) => setError(e));
  }, [taskId]);

  useFocusEffect(load);

  async function handleAction() {
    if (!task) return;
    const action = nextAction(task.status);
    if (!action || submitting) return; // đang gửi — khoá, chống bấm hai lần
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

  if (error !== null) {
    return (
      <View style={styles.container}>
        <LoadErrorBanner error={error} onRetry={load} onReauth={logout} />
      </View>
    );
  }

  if (!task) return <View style={styles.container} />;

  // trước đây khoá theo `task.status !== 'done'`: đi đo xong là
  // KHOÁ NGAY, sớm hơn ý. Người đang đo (status chưa done) luôn thấy form;
  // sau khi done, chỉ owner reopen được (từ nút "Sửa số đo" ở S19), và chỉ tới khi
  // "Chốt số cắt" thật sự chạy — `task.order.status` chuyển khỏi `moi` (orders.service.ts).
  const isMeasuring =
    task.line === 'dem' &&
    task.step === 'do' &&
    !!task.order &&
    task.order.status === 'moi' &&
    (task.status !== 'done' || user?.role === 'owner');
  const action = nextAction(task.status);
  const ackAt = task.events.find((e) => e.kind === 'acked')?.at;
  const startAt = task.events.find((e) => e.kind === 'started')?.at;
  const doneAt = task.events.find((e) => e.kind === 'done')?.at;
  // việc mảng bạt đi qua thêm bước "chia" (điều phối giao từ hàng đợi
  // §7 luồng B) trước khi tới "nhận". Việc may vá giao thẳng, không có bước này.
  // việc thợ tự ghi (S30, `source='self'`) không có ai giao/chia —
  // mốc đầu là "Tự ghi", không có "Chia cho bạn", không có dòng "Giao cho".
  const isSelf = task.source === 'self';
  const assignedAt =
    !isSelf && task.line === 'bat' && task.assignees.length > 0
      ? task.assignees.map((a) => a.assignedAt).sort()[0]
      : undefined;

  return (
    // bàn phím số của MeasurementEditor có thể che ô "Dày"/nút
    // cuối form trên máy màn nhỏ; `KeyboardAvoider` dùng chung, an toàn cho cả nhánh không
    // đo (không có TextInput nào bị ảnh hưởng).
    <KeyboardAvoider>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: space.md }}>
      <ScreenTitle>Chi tiết việc</ScreenTitle>
      {actionError && (
        <Banner
          visible
          icon={ErrorIcon}
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
      {/* (S29 tái dùng màn này) — khối riêng của mảng đệm: số đo,
          khách, gối, khu vực. CỐ Ý không có giá/cọc — `task.order` không mang field đó
          (TASK_INCLUDE.order, tasks.service.ts). Bước "đi đo" chưa xong → form nhập
          (MeasurementEditor); mọi bước khác → chỉ đọc. */}
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
      {/* màn CHI TIẾT phải đọc được hết nội dung — trước đây cắt 2 dòng
          (áp đồng loạt, nhưng chỉ nói về thẻ trong DANH SÁCH), phần cuối việc dài
          không đọc được ở màn nào của thợ. */}
      <Text variant="titleLarge" style={styles.content}>
        {task.content}
      </Text>
      {task.dueAt && (
        <Text variant="bodyLarge" style={styles.meta}>
          Hạn: {new Date(task.dueAt).toLocaleDateString('vi-VN')}
        </Text>
      )}
      {!isSelf && (
        <Text variant="bodyLarge" style={styles.meta}>
          Giao cho: {task.assignees.map((a) => a.user.name).join(', ')}
        </Text>
      )}
      <View style={styles.chipRow}>
        <StatusChip task={task} />
        {/* C22 "Chờ chủ duyệt" cả ở S7, kể cả khi việc đã xong:
            thợ mở chi tiết việc tự ghi phải thấy ngay nó chưa được chủ duyệt. */}
        {task.approval === 'pending' && <StatusPill kind="pending" />}
      </View>

      {/* owner KHÔNG được ack/bắt đầu/xong thay công nhân — server đã chặn
          (403), nhưng owner mở màn này rất thường (S1 "chưa ai nhận" -> S7, S19 "công đoạn"
          -> S7) nên phải ẩn nút ở đây, không chỉ dựa vào lỗi từ server
          (phát hiện qua luồng owner mở S19 -> Task chưa ai nhận). */}
      {action && user?.role !== 'owner' && (
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
        {isSelf ? 'Tự ghi' : 'Giao việc'} · {formatTime(task.createdAt)}
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
    </KeyboardAvoider>
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
  measureRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  measureInput: { flex: 1 },
  content: { marginBottom: space.sm },
  meta: { marginTop: space.xs, color: colors.onSurfaceVariant },
  chipRow: { marginTop: space.md, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  actionButton: { borderRadius: shape.small, marginTop: space.md },
  sec: { color: colors.onSurfaceVariant, marginTop: space.lg, marginBottom: space.sm },
  time: { color: colors.onSurfaceVariant, lineHeight: 32 },
});
