import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface MarketplaceUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  linkedPlayerId: string | null;
  linkedPlayer: any | null;
  role: string;
  emailVerified: boolean;
  hasPassword: boolean;
  photoUrl?: string | null;
}

interface MarketplaceAuthContextType {
  user: MarketplaceUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  signup: (input: {
    email: string;
    password: string;
    name: string;
    phone: string;
    gender: 'Male' | 'Female';
    assessmentAnswers: [number, number, number];
    referralCode?: string;
    promo?: string;
    remember?: boolean;
  }) => Promise<void>;
  loginWithTokens: (
    accessToken: string,
    refreshToken: string,
    remember?: boolean,
  ) => Promise<MarketplaceUser | null>;
  completeProfile: (input: {
    gender: 'Male' | 'Female';
    assessmentAnswers: [number, number, number];
  }) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const MarketplaceAuthContext = createContext<MarketplaceAuthContextType | undefined>(undefined);

const ACCESS_KEY = 'mp_accessToken';
const REFRESH_KEY = 'mp_refreshToken';
const REMEMBER_KEY = 'mp_remember';
const REMEMBERED_EMAIL_KEY = 'mp_rememberedEmail';

function getRememberPreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false';
  } catch {
    return true;
  }
}

function getStore(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

// Read a token, preferring localStorage (persistent) and falling back to
// sessionStorage (current-browser-session only).
function readToken(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeTokens(accessToken: string, refreshToken: string, remember: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
    const store = getStore(remember);
    const otherStore = remember ? sessionStorage : localStorage;
    store.setItem(ACCESS_KEY, accessToken);
    store.setItem(REFRESH_KEY, refreshToken);
    // Make sure the same keys aren't lingering in the other store.
    otherStore.removeItem(ACCESS_KEY);
    otherStore.removeItem(REFRESH_KEY);
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

function writeAccessToken(accessToken: string) {
  try {
    const remember = getRememberPreference();
    getStore(remember).setItem(ACCESS_KEY, accessToken);
  } catch {
    // ignore
  }
}

function clearAllTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
}

export function MarketplaceAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(() => readToken(ACCESS_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => readToken(REFRESH_KEY));
  const [error, setError] = useState<string | null>(null);
  const isRefreshing = useRef(false);
  const lastRefreshAttempt = useRef(0);

  const { data: user, isLoading } = useQuery<MarketplaceUser>({
    queryKey: ['/api/marketplace/auth/me'],
    enabled: !!accessToken,
    retry: false,
    queryFn: async () => {
      const response = await fetch('/api/marketplace/auth/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        if (response.status === 401 && refreshToken) {
          await refreshAccessToken();
        }
        throw new Error('Failed to fetch user');
      }
      return response.json();
    },
  });

  const clearTokens = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    clearAllTokens();
    queryClient.setQueryData(['/api/marketplace/auth/me'], null);
  }, [queryClient]);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken || isRefreshing.current) return false;
    const now = Date.now();
    if (now - lastRefreshAttempt.current < 30000) return false;
    isRefreshing.current = true;
    lastRefreshAttempt.current = now;
    try {
      const response = await fetch('/api/marketplace/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) throw new Error('Refresh failed');
      const data = await response.json();
      setAccessToken(data.accessToken);
      writeAccessToken(data.accessToken);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      isRefreshing.current = false;
      return true;
    } catch {
      isRefreshing.current = false;
      clearTokens();
      return false;
    }
  }, [refreshToken, queryClient, clearTokens]);

  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    const interval = setInterval(() => refreshAccessToken(), 3.5 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accessToken, refreshToken, refreshAccessToken]);

  const login = async (email: string, password: string, remember: boolean = true) => {
    setError(null);
    try {
      const response = await fetch('/api/marketplace/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Login failed');
      }
      const data = await response.json();
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      writeTokens(data.accessToken, data.refreshToken, remember);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (input: {
    email: string;
    password: string;
    name: string;
    phone: string;
    gender: 'Male' | 'Female';
    assessmentAnswers: [number, number, number];
    referralCode?: string;
    promo?: string;
    remember?: boolean;
  }) => {
    const remember = input.remember ?? true;
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        email: input.email,
        password: input.password,
        name: input.name,
        phone: input.phone,
        gender: input.gender,
        assessmentAnswers: input.assessmentAnswers,
      };
      if (input.referralCode) payload.referralCode = input.referralCode;
      if (input.promo) payload.promo = input.promo;
      const response = await fetch('/api/marketplace/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Signup failed');
      }
      const data = await response.json();
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      writeTokens(data.accessToken, data.refreshToken, remember);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithTokens = async (
    accessToken: string,
    refreshToken: string,
    remember: boolean = true,
  ): Promise<MarketplaceUser | null> => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    writeTokens(accessToken, refreshToken, remember);

    // Immediately fetch the user profile using the new token and populate the
    // query cache. This ensures isAuthenticated is true before the caller
    // navigates, preventing the protected-route race condition where user=null
    // causes an unwanted redirect back to /marketplace/login.
    // Also returned so callers (e.g. GoogleAuthCallback) can branch on
    // linkedPlayerId without waiting for the next render.
    try {
      const response = await fetch('/api/marketplace/auth/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const userData = (await response.json()) as MarketplaceUser;
        queryClient.setQueryData(['/api/marketplace/auth/me'], userData);
        return userData;
      }
    } catch {
      // Non-fatal — the query will self-heal on the next render cycle
    }
    return null;
  };

  const completeProfile = async (input: {
    gender: 'Male' | 'Female';
    assessmentAnswers: [number, number, number];
  }) => {
    if (!accessToken) {
      throw new Error('Not signed in');
    }
    const response = await fetch('/api/marketplace/auth/complete-profile', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to complete profile');
    }
    // Refetch so user.linkedPlayerId is updated and protected routes unblock.
    await queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
    await queryClient.refetchQueries({ queryKey: ['/api/marketplace/auth/me'] });
  };

  const logout = async () => {
    try {
      if (accessToken && refreshToken) {
        await fetch('/api/marketplace/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      clearTokens();
      // Intentionally keep `mp_rememberedEmail` so the user's email stays
      // pre-filled on the login page after they log out — typical
      // "remember me" UX. The email is only removed when the user
      // explicitly unchecks the box during a subsequent login.
      queryClient.clear();
    }
  };

  return (
    <MarketplaceAuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        loginWithTokens,
        completeProfile,
        logout,
        error,
      }}
    >
      {children}
    </MarketplaceAuthContext.Provider>
  );
}

export function useMarketplaceAuth() {
  const context = useContext(MarketplaceAuthContext);
  if (!context) throw new Error('useMarketplaceAuth must be used within MarketplaceAuthProvider');
  return context;
}
