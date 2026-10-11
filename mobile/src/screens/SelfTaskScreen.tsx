import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Banner, Button, Text, TextInput } from 'react-native-paper';
import { api, ApiError } from '../api/client';
import type { Task, TaskApproval } from '../api/types';
import { colors, fontSize, shape, space, tapMin } from '../theme/tokens';
import { ScreenTitle } from '../common/ScreenTitle';
import { KeyboardAvoider } from '../common/KeyboardAvoider';
import { ErrorIcon, bannerActionStyle } from '../common/bannerParts';
import { findDueAt } from '../voice/parseUtterance';
import { track } from '../analytics/track';
import { useAuth } from '../auth/AuthContext';

const MAX_CONTENT = 200;

/** Hạn gõ tay: nhận NĂM-THÁNG-NGÀY như S3, hoặc chữ đời thường như lúc nói ("thứ Sáu",
 * "mai", "hôm nay") — dùng lại đúng bộ tách hạn của giọng nói (voice/parseUtterance.ts). */
function resolveDue(raw: string): { iso: string | null; error: string | null } {
  const v = raw.trim();
  if (!v) return { iso: null, error: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { iso: v, error: null };
  const { dueAt } = findDueAt(v, new Date());
  if (dueAt) return { iso: dueAt, error: null };
  return { iso: null, error: 'Chưa hiểu hạn này. Gõ "mai", "thứ Sáu" hoặc 2026-09-25.' };
}

// Thợ may vá/bạt và
// điều phối tự đưa việc mình đang làm lên hệ thống: nội dung + hạn tuỳ chọn, người nhận luôn là
// chính mình, mảng do server lấy theo `User.line` ().
// `onDone` mang `approval` của response về S6 để S6 hiện Snackbar C15
// nói rõ việc vừa ghi đang chờ duyệt hay đã vào danh sách (§4c: im lặng không phải thành công).
export function SelfTaskScreen({ onDone }: { onDone: (approval?: TaskApproval) => void }) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [due, setDue] = useState('');
  const [contentError, setContentError] = useState<string | null>(null);
  const [dueError, setDueError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const resolved = resolveDue(due);

  async function handleSubmit() {
    if (sending) return;
    const text = content.trim();
    const cErr = text ? null : 'Ghi vài chữ việc bạn đang làm.';
    const { iso, error: dErr } = resolveDue(due);
    setContentError(cErr);
    setDueError(dErr);
    if (cErr || dErr) return;
    setSending(true);
    setSendError(null);
    try {
      const task = await api.post<Task>('/tasks/self', { content: text, ...(iso ? { dueAt: iso } : {}) });
      if (user) track('tu_ghi_viec', user.id, { approval: task?.approval ?? 'unknown' });
      // Về S6 — S6 tải lại khi lấy focus, thẻ mới hiện kèm chip "Chờ chủ duyệt" nếu cần.
      // Không giả định `status` của việc mới (server có thể cho bắt đầu ở `acked`).
      onDone(task?.approval);
    } catch (e) {
      // §5 "Lỗi": giữ nguyên thứ đang gõ, chỉ báo.
      setSendError(e instanceof ApiError ? e.message : 'Mất kết nối — chưa ghi được. Thử lại.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoider>
      <View style={styles.outer}>
        {sendError && (
          <Banner
            visible
            icon={ErrorIcon}
            style={styles.errorBanner}
            actions={[{ ...bannerActionStyle, label: 'Thử lại', onPress: handleSubmit }]}
          >
            {sendError}
          </Banner>
        )}
        <ScrollView contentContainerStyle={{ padding: space.md }} keyboardShouldPersistTaps="handled">
          <ScreenTitle>Ghi việc tôi làm</ScreenTitle>
          {/* ô nhập, nhãn nhỏ phía trên, sai = viền --color-error + câu báo. */}
          <TextInput
            label="Việc gì"
            mode="outlined"
            placeholder="Ví dụ: khâu lại 3 bạt rách cho anh Bảy"
            value={content}
            onChangeText={(v) => {
              setContent(v);
              if (contentError) setContentError(null);
            }}
            maxLength={MAX_CONTENT}
            multiline
            error={!!contentError}
            style={styles.input}
          />
          <View style={styles.helpRow}>
            <Text style={contentError ? styles.fieldError : styles.help}>{contentError ?? ' '}</Text>
            <Text style={styles.help}>
              {content.length}/{MAX_CONTENT}
            </Text>
          </View>
          <TextInput
            label="Hạn (bỏ trống nếu chưa rõ)"
            mode="outlined"
            placeholder="Thứ Sáu"
            value={due}
            onChangeText={(v) => {
              setDue(v);
              if (dueError) setDueError(null);
            }}
            error={!!dueError}
            style={styles.input}
            // máy 360×640dp bàn phím che nút "Ghi việc", cuộn cũng không
            // kéo ra được — phím ✓ ở ô cuối gửi luôn, khỏi phải đóng bàn phím rồi chạm thêm.
            returnKeyType="send"
            onSubmitEditing={() => void handleSubmit()}
          />
          <Text style={dueError ? styles.fieldError : styles.help}>
            {dueError ??
              (resolved.iso && !/^\d{4}-/.test(due.trim())
                ? `Hạn: ${new Date(resolved.iso).toLocaleDateString('vi-VN')}`
                : ' ')}
          </Text>
          {/* Một dòng nói trước kết quả. Máy thợ không biết cờ "Tự duyệt" của mình (API không
              trả về cho thợ) nên dùng câu trung tính đúng cho cả hai trường hợp.
              Trước đây câu "Nếu chủ xưởng cần duyệt…" bắt thợ đoán, và chữ
              "Xong" khác nút thật "Báo xong" — nay gọi đúng chữ trên nút (taskStatus ACTION_LABEL);
              kết quả thật (chờ duyệt hay không) báo bằng Snackbar ở S6 sau khi ghi. */}
          <Text style={styles.note}>
            Chủ xưởng có thể cần duyệt việc bạn tự ghi. Trong lúc chờ, bạn vẫn bấm Bắt đầu làm / Báo xong được.
          </Text>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={sending}
            disabled={sending}
            style={styles.button}
            contentStyle={{ height: tapMin }}
          >
            {sending ? 'Đang gửi…' : 'Ghi việc'}
          </Button>
        </ScrollView>
      </View>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.surface },
  errorBanner: { backgroundColor: colors.errorContainer, marginBottom: space.xs },
  input: { backgroundColor: colors.surfaceContainer },
  helpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  help: { fontSize: fontSize.label, color: colors.onSurfaceVariant, marginTop: space.xs, marginBottom: space.sm },
  fieldError: { fontSize: fontSize.label, color: colors.error, marginTop: space.xs, marginBottom: space.sm, flexShrink: 1 },
  note: { fontSize: fontSize.body, color: colors.onSurface, marginBottom: space.lg },
  button: { borderRadius: shape.small },
});
