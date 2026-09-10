import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api, clearToken, getToken, saveToken } from '../api/client';
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
    // Vòng 1 không lưu profile xuống máy (ARCHITECTURE.md §10 "không lưu việc xuống
    // máy") — token còn thì coi là còn phiên, nhưng /users/me chưa có ở vòng 1 nên
    // chỉ khôi phục được nếu app chưa bị kill; giữ đơn giản: có token thì để nguyên
    // màn đăng nhập tự xin lại nếu chưa có user trong bộ nhớ.
    getToken().finally(() => setRestoring(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      async loginOwner(email, password) {
        const res = await api.post<LoginResponse>('/auth/login', { email, password });
        await saveToken(res.token);
        setUser(res.user);
      },
      async loginByPairingCode(code, deviceLabel) {
        const res = await api.post<LoginResponse>('/auth/pairings/redeem', {
          code,
          deviceLabel,
        });
        await saveToken(res.token);
        setUser(res.user);
      },
      async logout() {
        await clearToken();
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
