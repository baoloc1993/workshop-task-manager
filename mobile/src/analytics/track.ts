// (đo phản ứng thị trường) — H3 chỉ đo được ở pilot
// nếu event đã chạy TỪ NGÀY DEPLOY; không thể thêm hồi tố sau khi pilot
// đã xong. Gọi HTTP capture API của PostHog trực tiếp (không dùng SDK `posthog-react-native`)
// SDK đó kéo theo native module (như `expo-notifications` đã từng gây sự cố:
// cài xong quên rebuild native làm app crash toàn bộ ngay trước demo), rủi ro không đáng cho
// một sản phẩm chỉ cần vài event đặt tên, không cần autocapture/session replay.
// KHÔNG chặn luồng chính nếu lỗi/thiếu key — cùng nguyên tắc với Expo Push
// (notifications.service.ts: "đo không được làm hỏng việc dùng app thật").
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = 'https://app.posthog.com';

export function track(event: string, distinctId: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return; // chưa cấu hình (local/dev) — no-op
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: distinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // im lặng — mất một event đo không đáng để làm phiền người dùng thật
  });
}
