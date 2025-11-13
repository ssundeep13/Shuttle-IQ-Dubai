import { useQuery } from "@tanstack/react-query";
import type { Session } from "@shared/schema";

export function useActiveSession() {
  const query = useQuery<Session | null>({
    queryKey: ['/api/sessions/active'],
    queryFn: async () => {
      const response = await fetch('/api/sessions/active');
      
      // 404 means no active session, which is a valid state
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch active session');
      }
      
      return response.json();
    },
    retry: false, // Don't retry on 404
  });

  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
    hasSession: !!query.data,
    refetch: query.refetch,
    error: query.error,
  };
}
