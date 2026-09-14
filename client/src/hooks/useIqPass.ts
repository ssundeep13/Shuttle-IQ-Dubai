// IQ Pass — client-side flag + the Rankings tier overlay.
//  • useIqPassEnabled: GET /api/marketplace/config. The server answers 404
//    while the flag is off (identical to an unknown /api path), so anything
//    but a 200 { iqPassEnabled: true } means "off". Cached for the session.
//  • useIqPassTiers: GET /api/marketplace/iq-pass/tiers → { playerId: tier }.
//    Only requested while the flag is on (ruling E5a: Rankings reads this
//    overlay; the 7-key public projection stays untouched).
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/queryClient';

export function useIqPassEnabled(): boolean {
  const { data } = useQuery<{ iqPassEnabled: boolean }>({
    queryKey: ['iq-pass', 'config'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/config'));
      if (!res.ok) return { iqPassEnabled: false };
      const j = await res.json();
      return { iqPassEnabled: j?.iqPassEnabled === true };
    },
    staleTime: Infinity,
    retry: false,
  });
  return data?.iqPassEnabled === true;
}

export function useIqPassTiers(): Record<string, string> {
  const enabled = useIqPassEnabled();
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['iq-pass', 'tiers'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/iq-pass/tiers'));
      if (!res.ok) return {};
      const j = await res.json();
      return j && typeof j === 'object' ? j : {};
    },
    enabled,
    staleTime: 60 * 1000,
    retry: false,
  });
  return data ?? {};
}
