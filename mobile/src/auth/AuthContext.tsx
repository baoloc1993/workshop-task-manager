import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api, clearToken, clearUser, getToken, getUser, saveToken, saveUser } from '../api/client';
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
      if (token && savedUser) setUser(savedUser);
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
      },
      async loginByPairingCode(code, deviceLabel) {
        const res = await api.post<LoginResponse>('/auth/pairings/redeem', {
          code,
          deviceLabel,
        });
        await Promise.all([saveToken(res.token), saveUser(res.user)]);
        setUser(res.user);
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
