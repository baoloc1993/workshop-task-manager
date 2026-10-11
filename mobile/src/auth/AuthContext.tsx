import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api, clearToken, clearUser, getToken, getUser, saveToken, saveUser } from '../api/client';
import { getExpoPushTokenAsync } from '../notifications/registerPushToken';
import { clearOrderListCache } from '../orders/orderListCache';
import { track } from '../analytics/track';
import type { AuthUser, LoginResponse } from '../api/types';

interface AuthContextValue {
  user: AuthUser | null;
  loginOwner: (email: string, password: string) => Promise<void>;
  loginByPairingCode: (
    code: string,
    deviceLabel?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    // Vòng 1 không lưu VIỆC xuống máy (ARCHITECTURE.md §10) — nhưng phiên đăng nhập
    // thì phải giữ (PRD §7: "sau khi ghép thì phiên giữ trên máy đó, không phải đăng
    // nhập lại"), kể cả khi hệ điều hành kill tiến trình app (rất hay xảy ra, dogfood
    // pha I phát hiện). Lưu kèm id/name/role (không phải "việc") để khôi phục ngay,
    // không cần endpoint /users/me (chưa có ở vòng 1).
    (async () => {
      const [token, savedUser] = await Promise.all([getToken(), getUser<AuthUser>()]);
      if (token && savedUser) {
        setUser(savedUser);
        // "Quay lại lần 2" (nhóm 4 production-ready) — phiên đã có sẵn, tức là mở lại app
        // chứ không phải đăng nhập mới lần đầu.
        track('mo_app', savedUser.id, { role: savedUser.role });
        // vòng 9 — AC-41: máy owner đăng nhập từ trước vòng 9 chưa từng gửi push token.
        if (savedUser.role === 'owner') {
          void getExpoPushTokenAsync()
            .then((t) => (t ? api.put('/users/me/push-token', { token: t }) : undefined))
            .catch(() => {});
        }
      }
      setRestoring(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async loginOwner(email, password) {
        const res = await api.post<LoginResponse>('/auth/login', { email, password });
        await Promise.all([saveToken(res.token), saveUser(res.user)]);
        setUser(res.user);
        track('dang_nhap', res.user.id, { role: res.user.role });
        // vòng 9 — AC-41: owner không ghép máy nên không có chỗ gửi push token; đăng ký
        // riêng để nhận "việc chờ duyệt". Best-effort, không chặn đăng nhập.
        void getExpoPushTokenAsync()
          .then((t) => (t ? api.put('/users/me/push-token', { token: t }) : undefined))
          .catch(() => {});
      },
      async loginByPairingCode(code, deviceLabel) {
        // CAP-TASK-14 — best-effort: xin quyền/lấy token push chậm hoặc lỗi không được
        // chặn ghép máy (registerPushToken.ts không bao giờ throw, có thể trả undefined).
        const deviceToken = await getExpoPushTokenAsync();
        const res = await api.post<LoginResponse>('/auth/pairings/redeem', {
          code,
          deviceLabel,
          deviceToken,
        });
        await Promise.all([saveToken(res.token), saveUser(res.user)]);
        setUser(res.user);
        track('dang_nhap', res.user.id, { role: res.user.role });
      },
      async logout() {
        // vòng 9 — AC-41: máy owner đã đăng xuất không nhận "việc chờ duyệt" nữa. Gọi TRƯỚC
        // khi xoá token phiên; lỗi (mất mạng, phiên hết hạn) bỏ qua, đăng xuất vẫn chạy.
        if (user?.role === 'owner') {
          await api.put('/users/me/push-token', { token: null }).catch(() => {});
        }
        await Promise.all([clearToken(), clearUser()]);
        clearOrderListCache();
        setUser(null);
      },
    }),
    [user],
  );

  if (restoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
