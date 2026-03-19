import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      const errorMessage = json.error || json.message || res.statusText;
      throw { error: errorMessage, status: res.status };
    } catch {
      throw { error: text || res.statusText, status: res.status };
    }
  }
}

function getAuthToken(url: string): string | null {
  const isAdminPage = window.location.pathname.startsWith('/admin');
  if (isAdminPage) {
    return localStorage.getItem('accessToken');
  }

  const isMarketplace = url.startsWith('/api/marketplace/') || url.startsWith('/api/tags/');
  const isAdminMarketplace = url.startsWith('/api/marketplace/admin/') ||
    (url.startsWith('/api/marketplace/sessions/') && url.endsWith('/bookings')) ||
    (url.includes('/api/marketplace/bookings/') && url.endsWith('/attend'));
  
  if (isMarketplace && !isAdminMarketplace) {
    return localStorage.getItem('mp_accessToken');
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
