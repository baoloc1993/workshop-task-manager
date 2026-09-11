import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'workshop-app.token';
const USER_KEY = 'workshop-app.user';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Lỗi mạng riêng để screen phân biệt được với lỗi nghiệp vụ (ApiError) — quyết định ở
// DESIGN-SYSTEM.md §5 "Lỗi": banner mất mạng khác câu với lỗi API thường.
export class NetworkError extends Error {}

// Target thật là Android/iOS (TECHSTACK.md) — expo-secure-store không có bản web.
// Nhánh web chỉ để xem giao diện lúc chưa có emulator, không phải đường chạy thật.
export async function saveToken(token: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Lưu kèm hồ sơ nhỏ (id/name/role, KHÔNG phải "profile" hay "việc" — ARCHITECTURE.md
// §10 chỉ cấm lưu việc xuống máy) để khôi phục phiên khi app bị hệ điều hành kill —
// dogfood pha I: thiếu bước này làm mất phiên hoàn toàn, phải
// gõ lại email/mật khẩu mỗi lần mở app, trái PRD §7 "không phải đăng nhập lại".
export async function saveUser(user: { id: string; name: string; role: string }) {
  const raw = JSON.stringify(user);
  if (Platform.OS === 'web') {
    localStorage.setItem(USER_KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(USER_KEY, raw);
}

export async function getUser<T>(): Promise<T | null> {
  const raw = Platform.OS === 'web' ? localStorage.getItem(USER_KEY) : await SecureStore.getItemAsync(USER_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function clearUser() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(USER_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(USER_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new NetworkError('Mất kết nối — đang thử lại');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: 'Có lỗi xảy ra' }));
    throw new ApiError(res.status, body.message ?? 'Có lỗi xảy ra');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};
