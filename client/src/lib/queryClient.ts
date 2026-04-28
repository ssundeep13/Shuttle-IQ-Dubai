import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      const errorMessage = json.error || json.message || res.statusText;
      throw { error: errorMessage, status: res.status, code: json.code };
    } catch {
      throw { error: text || res.statusText, status: res.status };
    }
  }
}

// Read the marketplace access token from localStorage first, then fall back to
// sessionStorage. The marketplace auth context stores the token in either
// store depending on the user's "remember me" preference (localStorage when
// remembered, sessionStorage otherwise) — this helper mirrors the auth
// context's own readToken() so every marketplace fetcher in the app finds
// the token regardless of which store it ended up in.
export function getMarketplaceAccessToken(): string | null {
  try {
    return localStorage.getItem('mp_accessToken') ?? sessionStorage.getItem('mp_accessToken');
  } catch {
    return null;
  }
}

function getAuthToken(url: string): string | null {
  const isAdminPage = window.location.pathname.startsWith('/admin');
  if (isAdminPage) {
    return localStorage.getItem('accessToken');
  }

  const isMarketplace = url.startsWith('/api/marketplace/') || url.startsWith('/api/tags/') || url.startsWith('/api/referrals/player');
  const isAdminMarketplace = url.startsWith('/api/marketplace/admin/') ||
    (url.startsWith('/api/marketplace/sessions/') && url.endsWith('/bookings')) ||
    (url.includes('/api/marketplace/bookings/') && url.endsWith('/attend'));
  
  if (isMarketplace && !isAdminMarketplace) {
    return getMarketplaceAccessToken();
  }
  return localStorage.getItem('accessToken');
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const accessToken = getAuthToken(url);
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  if (res.status === 204) {
    return undefined as T;
  }
  
  return await res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const headers: Record<string, string> = {};
    
    const accessToken = getAuthToken(url);
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    
    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Cache data for 60 s so navigating back to a recently visited page
      // reuses the cached result instead of re-fetching.
      staleTime: 60 * 1000,
      // Retry once (after 2 s) on network errors only — e.g. when the server
      // is waking up from a cold start. Never retry on HTTP errors (401/404/500).
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false;
        const message = error instanceof Error ? error.message : "";
        return message === "Failed to fetch" || message.toLowerCase().includes("network");
      },
      retryDelay: 2000,
    },
    mutations: {
      retry: false,
    },
  },
});
