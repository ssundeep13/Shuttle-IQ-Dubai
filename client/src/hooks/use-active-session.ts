import { useQuery } from "@tanstack/react-query";
import type { Session } from "@shared/schema";

export function useActiveSession() {
  const query = useQuery<Session | null>({
    queryKey: ['/api/sessions/active'],
  });

  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
    hasSession: !!query.data,
    refetch: query.refetch,
    error: query.error,
  };
}
