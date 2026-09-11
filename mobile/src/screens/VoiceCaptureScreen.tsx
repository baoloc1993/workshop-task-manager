import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Banner, Text } from 'react-native-paper';
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
      <Pressable
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
        <Text variant="titleMedium" style={styles.micLabel}>
          {listening ? '🎤 Đang nghe…' : '🎤 Giữ để nói'}
        </Text>
      </Pressable>
    </View>
  );
}

function mapErrorMessage(code: string): string {
  if (code === 'no-speech') return 'Không nghe được gì.';
  if (code === 'not-allowed') return 'Chưa được cấp quyền micro.';
  return 'Không nghe được. Bạn gõ giúp phần còn thiếu.';
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.md, backgroundColor: colors.surface, justifyContent: 'space-between' },
  errorBanner: { marginBottom: space.md, backgroundColor: colors.errorContainer },
  sectionLabel: { marginBottom: space.sm, color: colors.onSurfaceVariant },
  heard: { flex: 1, marginBottom: space.lg },
  mic: {
    minHeight: tapMin * 1.5,
    borderRadius: shape.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  micActive: { backgroundColor: colors.tertiaryContainer },
  micLabel: { color: colors.onPrimaryContainer },
});
