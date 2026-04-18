import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface MarketplaceUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  linkedPlayerId: string | null;
  linkedPlayer: any | null;
  role: string;
}

interface MarketplaceAuthContextType {
  user: MarketplaceUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, phone?: string, referralCode?: string, promo?: string) => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const MarketplaceAuthContext = createContext<MarketplaceAuthContextType | undefined>(undefined);

export function MarketplaceAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem('mp_accessToken')
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    localStorage.getItem('mp_refreshToken')
  );
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
      localStorage.setItem('mp_accessToken', data.accessToken);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      isRefreshing.current = false;
      return true;
    } catch {
      isRefreshing.current = false;
      clearTokens();
      return false;
    }
  }, [refreshToken, queryClient]);

  function clearTokens() {
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('mp_accessToken');
    localStorage.removeItem('mp_refreshToken');
    queryClient.setQueryData(['/api/marketplace/auth/me'], null);
  }

  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    const interval = setInterval(() => refreshAccessToken(), 3.5 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [accessToken, refreshToken, refreshAccessToken]);

  const login = async (email: string, password: string) => {
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
      localStorage.setItem('mp_accessToken', data.accessToken);
      localStorage.setItem('mp_refreshToken', data.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email: string, password: string, name: string, phone?: string, referralCode?: string, promo?: string) => {
    setError(null);
    try {
      const payload: Record<string, string | undefined> = { email, password, name, phone };
      if (referralCode) payload.referralCode = referralCode;
      if (promo) payload.promo = promo;
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
      localStorage.setItem('mp_accessToken', data.accessToken);
      localStorage.setItem('mp_refreshToken', data.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const loginWithTokens = async (accessToken: string, refreshToken: string) => {
    setAccessToken(accessToken);
    setRefreshToken(refreshToken);
    localStorage.setItem('mp_accessToken', accessToken);
    localStorage.setItem('mp_refreshToken', refreshToken);

    // Immediately fetch the user profile using the new token and populate the
    // query cache. This ensures isAuthenticated is true before the caller
    // navigates, preventing the protected-route race condition where user=null
    // causes an unwanted redirect back to /marketplace/login.
    try {
      const response = await fetch('/api/marketplace/auth/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const userData = await response.json();
        queryClient.setQueryData(['/api/marketplace/auth/me'], userData);
      }
    } catch {
      // Non-fatal — the query will self-heal on the next render cycle
    }
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
