import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Configurable API origin for the Capacitor wrap (prep item #1).
//  • Web builds: VITE_API_BASE is unset → API_BASE is '' → every request stays
//    relative ('/api/...'), byte-for-byte identical to today.
//  • Native builds: set VITE_API_BASE to the Railway backend origin
//    (e.g. https://api.example.com) so the same code issues absolute requests.
const API_BASE = ((import.meta as any).env?.VITE_API_BASE ?? '').replace(/\/$/, '');

// Prefix an app API path with the configured base. Only '/api' paths are
// prefixed; already-absolute URLs or non-api paths are returned unchanged.
// With API_BASE empty this returns `path` verbatim — a pure no-op for the web.
export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return path.startsWith('/api') ? `${API_BASE}${path}` : path;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    // Parse FIRST, throw after: the old version threw inside its own try
    // block, so its own catch re-threw { error: <raw JSON text> } for every
    // JSON error body — the raw-JSON leak on every toast in the app. The
    // structured payload (e.g. conflicts) rides along for self-healing.
    let payload: any = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // not JSON — plain text or empty body
    }
    throw {
      error: payload?.error || payload?.message || text || res.statusText,
      status: res.status,
      code: payload?.code,
      payload,
    };
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

  const isMarketplace = url.startsWith('/api/marketplace/') || url.startsWith('/api/tags/') || url.startsWith('/api/referrals/player') || url.startsWith('/api/referrals/link');
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
  
  const res = await fetch(apiUrl(url), {
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
    
    const res = await fetch(apiUrl(url), {
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
