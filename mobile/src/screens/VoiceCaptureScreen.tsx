import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Text, TouchableRipple } from 'react-native-paper';
import { ScreenTitle } from '../common/ScreenTitle';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { api } from '../api/client';
import type { WorkerListItem } from '../api/types';
import { parseUtterance, type ParsedUtterance } from '../voice/parseUtterance';
import { colors, space, shape, tapMin } from '../theme/tokens';

// S2 — "Nói để giao việc" (PROTOTYPE.md §1, vòng 2). AC-6.
// Giữ nút micro để nói, thả ra để dừng và nghe kết quả → luôn đưa sang S3 để soát
// (ARCHITECTURE.md §6/§8: "không bao giờ phát việc thẳng từ kết quả nhận dạng").
export function VoiceCaptureScreen({ onParsed, onFallbackToManual }: {
  onParsed: (result: ParsedUtterance) => void;
  onFallbackToManual: (partialHeard: string) => void;
}) {
  const [heard, setHeard] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workersRef = useRef<WorkerListItem[]>([]);

  useEffect(() => {
    api
      .get<WorkerListItem[]>('/users')
      .then((list) => {
        workersRef.current = list.filter((w) => w.role === 'worker' && w.line === 'may_va');
      })
      .catch(() => {
        // Danh sách người chỉ cần để khớp tên trong câu nói — thiếu thì vẫn cho nói,
        // S3 vẫn cho chọn người bằng tay.
        workersRef.current = [];
      });
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setHeard(text);
  });

  useSpeechRecognitionEvent('end', () => {
    setListening(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setError(mapErrorMessage(event.error));
  });

  const startListening = useCallback(async () => {
    setError(null);
    setHeard('');
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Chưa được cấp quyền micro. Bạn gõ tay giúp phần này.');
      return;
    }
    setListening(true);
    ExpoSpeechRecognitionModule.start({
      lang: 'vi-VN',
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const handleDone = useCallback(() => {
    const finalText = heard.trim();
    if (!finalText) {
      onFallbackToManual('');
      return;
    }
    const parsed = parseUtterance(finalText, workersRef.current);
    onParsed(parsed);
  }, [heard, onParsed, onFallbackToManual]);

  return (
    <View style={styles.container}>
      <ScreenTitle>Nói để giao việc</ScreenTitle>
      {error && (
        <Banner visible icon="alert-circle" style={styles.errorBanner} actions={[{ label: 'Gõ tay', onPress: () => onFallbackToManual(heard) }]}>
          {error} Phần đã nghe được vẫn giữ nguyên bên dưới.
        </Banner>
      )}
      <Text variant="labelLarge" style={styles.sectionLabel}>
        Nghe được
      </Text>
      <Text variant="bodyLarge" style={styles.heard}>
        {heard || 'Nói một câu như đang nói với thợ, ví dụ: "giao cho Toàn may 20 áo, thứ Sáu giao".'}
      </Text>
      <TouchableRipple
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Đang nghe — thả tay để dừng' : 'Giữ để nói'}
        onPressIn={startListening}
        onPressOut={() => {
          stopListening();
          // stop() là bất đồng bộ (chờ event 'end'); tách qua handleDone khi transcript ổn định.
          setTimeout(handleDone, 300);
        }}
        style={[styles.mic, listening && styles.micActive]}
      >
        <View style={styles.micInner}>
          <Text variant="titleMedium" style={[styles.micLabel, listening && styles.micLabelActive]}>
            {listening ? '🎤 Đang nghe…' : '🎤 Giữ để nói'}
          </Text>
        </View>
      </TouchableRipple>
    </View>
  );
}

function mapErrorMessage(code: string): string {
  if (code === 'no-speech') return 'Không nghe được gì.';
  if (code === 'not-allowed') return 'Chưa được cấp quyền micro.';
  return 'Không nghe được. Bạn gõ giúp phần còn thiếu.';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: space.md,
    // Chừa chỗ đáy cho nút giữ-để-nói nổi (position: absolute) khỏi đè lên câu đang nghe được.
    paddingBottom: tapMin + space.lg,
    backgroundColor: colors.surface,
  },
  errorBanner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  sectionLabel: { marginBottom: space.sm, color: colors.onSurfaceVariant },
  heard: { flex: 1, marginBottom: space.lg },
  mic: {
    // Nút giữ-để-nói riêng của S2 — không phải C7 (thanh thêm ghim đáy của các màn danh
    // sách; DESIGN-SYSTEM.md §4 từ 2026-09-15). Nút nổi góc dưới phải trong tầm ngón cái,
    // tô --color-primary — dogfood pha I vòng 2 (edge + picky) phát hiện nút này trước đó
    // nằm giữa/đáy màn full-width và tô nhầm --color-primary-container (màu chip).
    //
    // LƯU Ý MÔI TRƯỜNG DEV (không phải bug sản phẩm): trên bản debug qua Expo dev client/Metro,
    // menu nổi của dev tools chiếm đúng góc dưới-phải và nuốt hết cảm ứng ở đó — đứng yên tuyệt
    // đối khi giữ nút là do lớp che này, xác nhận bằng cách di chuyển nút sang góc khác thì bấm
    // được ngay (đo `onPressIn` bắn đúng, "Đang nghe…" hiện đúng). Bản production/release
    // không có dev tools nên không có lớp che này — vị trí góc dưới-phải theo đúng spec vẫn đúng.
    position: 'absolute',
    right: space.md,
    bottom: space.lg,
    minHeight: tapMin,
    borderRadius: shape.full,
    backgroundColor: colors.primary,
    elevation: 3,
  },
  micInner: {
    minHeight: tapMin,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { backgroundColor: colors.tertiaryContainer },
  micLabel: { color: colors.onPrimary },
  micLabelActive: { color: colors.onTertiaryContainer },
});
