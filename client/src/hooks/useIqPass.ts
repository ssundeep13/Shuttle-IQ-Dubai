// IQ Pass — client-side flag + public config + the Rankings tier overlay.
//  • useIqPassConfig: GET /api/marketplace/config. The server answers 404 while the
//    flag is off (identical to an unknown /api path), so anything but a 200
//    { iqPassEnabled: true, iqPassTiers: [...] } means "off". Cached for the session.
//    The tier table (label, games, pass price) is server-owned — the client never
//    re-derives money (Gate 12: Dashboard promo card, landing section).
//  • useIqPassEnabled: the boolean view of the same query (every flag-gated screen).
//  • useIqPassTiers: GET /api/marketplace/iq-pass/tiers → { playerId: tier }.
//    Only requested while the flag is on (ruling E5a: Rankings reads this
//    overlay; the 7-key public projection stays untouched).
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/queryClient';

export type IqPassTierPublic = { tier: string; label: string; games: number; priceAed: number };
type IqPassConfig = { iqPassEnabled: boolean; iqPassTiers: IqPassTierPublic[] };

const OFF: IqPassConfig = { iqPassEnabled: false, iqPassTiers: [] };

export function useIqPassConfig(): { enabled: boolean; tiers: IqPassTierPublic[] } {
  const { data } = useQuery<IqPassConfig>({
    queryKey: ['iq-pass', 'config'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/config'));
      if (!res.ok) return OFF;
      const j = await res.json();
      if (j?.iqPassEnabled !== true) return OFF;
      const tiers = Array.isArray(j.iqPassTiers)
        ? j.iqPassTiers.filter((t: unknown): t is IqPassTierPublic => !!t && typeof t === 'object' && typeof (t as IqPassTierPublic).tier === 'string')
        : [];
      return { iqPassEnabled: true, iqPassTiers: tiers };
    },
    staleTime: Infinity,
    retry: false,
  });
  return { enabled: data?.iqPassEnabled === true, tiers: data?.iqPassTiers ?? [] };
}

export function useIqPassEnabled(): boolean {
  return useIqPassConfig().enabled;
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
