import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
      const response = await fetch('/api/auth/me', {
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

  // Auto-refresh access token with debouncing and error handling
  const refreshAccessToken = useCallback(async (showNotification = false) => {
    if (!refreshToken) return false;
    
    // Prevent multiple simultaneous refresh attempts
    if (isRefreshing.current) return false;
    
    // Debounce: don't refresh if we just refreshed within last 30 seconds
    const now = Date.now();
    if (now - lastRefreshAttempt.current < 30000) return false;
    
    isRefreshing.current = true;
    lastRefreshAttempt.current = now;

    try {
      const response = await fetch('/api/auth/refresh', {
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
      isRefreshing.current = false;
      return true;
    } catch (error) {
      isRefreshing.current = false;
      
      // Refresh failed, clear tokens and auth state
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenTimestamp');
      
      // Clear user query to force isAuthenticated to false
      // Use setQueryData only to avoid unnecessary refetches
      queryClient.setQueryData(['/api/auth/me'], null);
      
      // Show notification if requested
      if (showNotification) {
        toast({
          title: "Session Expired",
          description: "Your session has ended. Please log in again to continue.",
          variant: "destructive",
        });
      }
      return false;
    }
  }, [refreshToken, queryClient, toast]);

  // Set up automatic token refresh (every 3.5 hours, before 4h expiry)
  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const interval = setInterval(() => {
      refreshAccessToken();
    }, 3.5 * 60 * 60 * 1000); // 3.5 hours (210 minutes)

    return () => clearInterval(interval);
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

  // Check token validity on initial load - only if tokens exist from a previous session
  // Skip if we just logged in (tokens are new and valid)
  useEffect(() => {
    const tokenAge = localStorage.getItem('tokenTimestamp');
    const now = Date.now();
    
    // Only refresh if tokens are older than 1 minute (not a fresh login)
    if (accessToken && refreshToken && tokenAge) {
      const age = now - parseInt(tokenAge, 10);
      if (age > 60000) { // More than 1 minute old
        refreshAccessToken();
      }
    }
  }, []); // Only run once on mount

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await fetch('/api/auth/login', {
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
        await fetch('/api/auth/logout', {
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

  // Add access token to all API requests using stable fetch reference
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
        
        if (url.startsWith('/api') && !url.startsWith('/api/auth') && !url.startsWith('/api/marketplace/')) {
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${accessToken}`);
          
          return originalFetch(input, {
            ...init,
            headers,
          });
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
  }, [accessToken]);

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
