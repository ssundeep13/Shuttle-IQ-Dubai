import { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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
  const [accessToken, setAccessToken] = useState<string | null>(() => 
    localStorage.getItem('accessToken')
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() => 
    localStorage.getItem('refreshToken')
  );
  const [error, setError] = useState<string | null>(null);

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
          await refreshAccessToken();
        }
        throw new Error('Failed to fetch user');
      }
      
      return response.json();
    },
  });

  // Auto-refresh access token
  const refreshAccessToken = async () => {
    if (!refreshToken) return;

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
      
      // Refetch user data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    } catch (error) {
      // Refresh failed, clear tokens and auth state
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      
      // Clear user query to force isAuthenticated to false
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.removeQueries({ queryKey: ['/api/auth/me'] });
    }
  };

  // Set up automatic token refresh (every 14 minutes, before 15min expiry)
  useEffect(() => {
    if (!accessToken || !refreshToken) return;

    const interval = setInterval(() => {
      refreshAccessToken();
    }, 14 * 60 * 1000); // 14 minutes

    return () => clearInterval(interval);
  }, [accessToken, refreshToken]);

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

  // Add access token to all API requests
  useEffect(() => {
    if (accessToken) {
      const originalFetch = window.fetch;
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        let url: string;
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof Request) {
          url = input.url;
        } else {
          url = input.toString();
        }
        
        // Add auth header to API requests
        if (url.startsWith('/api') && !url.startsWith('/api/auth')) {
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
        window.fetch = originalFetch;
      };
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
