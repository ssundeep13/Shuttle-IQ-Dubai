import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Gate 6a: read the JWT's exp claim (ms epoch) without a library. Returns
// null for anything unparseable — callers treat that as "schedule blind".
function decodeTokenExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Refresh this long before the token actually expires.
const REFRESH_LEAD_MS = 10 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [accessToken, setAccessToken] = useState<string | null>(() => 
    localStorage.getItem('accessToken')
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() => 
    localStorage.getItem('refreshToken')
  );
  const [error, setError] = useState<string | null>(null);
  const lastRefreshAttempt = useRef<number>(0);
  const isRefreshing = useRef<boolean>(false);
  const originalFetchRef = useRef<typeof window.fetch>(window.fetch.bind(window));

  // Query current user
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['/api/auth/me'],
    enabled: !!accessToken,
    retry: false,
    queryFn: async () => {
      const response = await fetch(apiUrl('/api/auth/me'), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        // Try to refresh token if access token expired
        if (response.status === 401 && refreshToken) {
          // Show notification since user is actively trying to use the app
          await refreshAccessToken(true);
        }
        throw new Error('Failed to fetch user');
      }
      
      return response.json();
    },
  });

  // Gate 6a: single-flight refresh. Concurrent callers (parallel queries all
  // hitting 401 at once, the exp timer, a focus handler) share ONE in-flight
  // request and all observe its outcome — so a burst of 401s produces exactly
  // one refresh and every caller can retry with the new token.
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);

  const refreshAccessToken = useCallback(async (showNotification = false): Promise<boolean> => {
    if (!refreshToken) return false;

    // Join an in-flight refresh instead of failing out.
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    // Debounce: don't START a new refresh within 30s of the last attempt
    // (protects the refresh endpoint from focus/visibility storms).
    const now = Date.now();
    if (now - lastRefreshAttempt.current < 30000) return false;

    isRefreshing.current = true;
    lastRefreshAttempt.current = now;

    const doRefresh = async (): Promise<boolean> => {
      try {
        const response = await fetch(apiUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          throw new Error('Failed to refresh token');
        }

        const data = await response.json();
        setAccessToken(data.accessToken);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('tokenTimestamp', Date.now().toString());

        // Refetch user data
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        return true;
      } catch (error) {
        // Refresh failed, clear tokens and auth state
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tokenTimestamp');

        // Clear user query to force isAuthenticated to false
        // Use setQueryData only to avoid unnecessary refetches
        queryClient.setQueryData(['/api/auth/me'], null);

        if (showNotification) {
          toast({
            title: "Session Expired",
            description: "Your session has ended. Please log in again to continue.",
            variant: "destructive",
          });
        }
        return false;
      } finally {
        isRefreshing.current = false;
        refreshPromiseRef.current = null;
      }
    };

    refreshPromiseRef.current = doRefresh();
    return refreshPromiseRef.current;
  }, [refreshToken, queryClient, toast]);

  // Gate 6a: refresh is scheduled off the token's ACTUAL expiry, not a fixed
  // interval from page load. The old 3.5h-from-load timer let a token loaded
  // from localStorage die mid-session (open the app with a 3.5h-old token →
  // it expires 30 minutes in, the timer fires 3 hours too late — the exact
  // failure that killed the simulated session). Refresh fires at exp−10min,
  // or immediately if we're already inside that window; each successful
  // refresh delivers a new token, which re-runs this effect and reschedules.
  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const expMs = decodeTokenExpMs(accessToken);
    // Unparseable token: fall back to a conservative hourly refresh.
    const delay = expMs === null
      ? 60 * 60 * 1000
      : Math.max(expMs - Date.now() - REFRESH_LEAD_MS, 0);

    const timer = setTimeout(() => {
      refreshAccessToken();
    }, delay);

    return () => clearTimeout(timer);
  }, [accessToken, refreshToken, refreshAccessToken]);

  // Refresh token when user returns to the tab (visibility change)
  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // User came back to the tab, check if token needs refresh
        // Show notification if refresh fails since user is actively returning to the app
        refreshAccessToken(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [accessToken, refreshToken, refreshAccessToken]);

  // Refresh token when window regains focus
  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const handleFocus = () => {
      // Show notification if refresh fails since user is actively using the app
      refreshAccessToken(true);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [accessToken, refreshToken, refreshAccessToken]);

  // (Gate 6a: the old mount-time "token older than 1 minute" refresh is gone —
  // the exp-based scheduler above already refreshes immediately on mount
  // whenever the stored token is inside its 10-minute expiry window.)

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      setRefreshToken(data.refreshToken);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('tokenTimestamp', Date.now().toString());
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setError(null);
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (accessToken && refreshToken) {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
      }
    },
    onSettled: () => {
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenTimestamp');
      
      // Clear user query and all cached data
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.clear();
      setError(null);
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  // Add access token to all API requests using stable fetch reference.
  // Gate 6a: on a 401 the wrapper runs ONE single-flight refresh and retries
  // the request once with the new token — a mid-session expiry (or a restart
  // that outraces the exp timer) self-heals instead of 401ing every mutation
  // until a page reload.
  useEffect(() => {
    if (accessToken) {
      // Use the stored original fetch reference to avoid closure issues
      const originalFetch = originalFetchRef.current;

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        let url: string;
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof Request) {
          url = input.url;
        } else {
          url = input.toString();
        }

        const isAdminApi = url.startsWith('/api') && !url.startsWith('/api/auth') && !url.startsWith('/api/marketplace/');
        if (isAdminApi) {
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${accessToken}`);

          const res = await originalFetch(input, { ...init, headers });
          if (res.status !== 401) return res;

          // Expired mid-session: refresh once (single-flight, shared across
          // concurrent 401s) and retry with the fresh token from storage.
          const refreshed = await refreshAccessToken(true);
          const freshToken = localStorage.getItem('accessToken');
          if (!refreshed || !freshToken) return res;

          const retryHeaders = new Headers(init?.headers);
          retryHeaders.set('Authorization', `Bearer ${freshToken}`);
          return originalFetch(input, { ...init, headers: retryHeaders });
        }

        return originalFetch(input, init);
      };

      return () => {
        // Restore the original fetch to avoid memory leaks and ensure consistency
        window.fetch = originalFetchRef.current;
      };
    } else {
      // When logged out, restore original fetch
      window.fetch = originalFetchRef.current;
    }
  }, [accessToken, refreshAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
