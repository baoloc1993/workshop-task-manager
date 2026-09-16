import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api, clearToken, clearUser, getToken, getUser, saveToken, saveUser } from '../api/client';
import { getExpoPushTokenAsync } from '../notifications/registerPushToken';
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
        await Promise.all([clearToken(), clearUser()]);
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
