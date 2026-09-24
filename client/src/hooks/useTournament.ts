// ShuttleIQ League — client data.
//  • useTournamentEnabled: GET /api/marketplace/tournament/config. 404 while TOURNAMENT_ENABLED is off (the
//    same JSON 404 as an unknown /api path) → anything but a 200 { tournamentEnabled: true } means off.
//  • useTournamentView: the public read (banner, pinned Sessions row, counter). Sends the token when there is
//    one, so members and preview accounts see the early stage. { visible: false } before the open.
//  • useMyTournamentEntry: GET /me — my active entry, the tier I would register as, whether I can.
//  • useTournamentActions: register / pay / withdraw / sponsor tick; a Ziina redirect is opened with the
//    native-aware helper; every tournament query refreshes afterwards.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUrl, getMarketplaceAccessToken } from '@/lib/queryClient';
import { openCheckoutRedirect, nativeReturnFields } from '@/lib/nativeAuth';
import { errorCopy, type TierState } from '@/lib/tournamentCopy';

export type TournamentPublic = {
  id: string; name: string; startsAt: string; endsAt: string; venueName: string; venueLocation: string | null; venueMapUrl: string | null;
  entryFeeAed: number; registrationOpensAtMembers: string | null; registrationOpensAt: string; registrationClosesAt: string;
  withdrawDeadlineAt: string; draftCutoffAt: string; deckUrl: string | null;
};
export type TournamentPhase = 'before_open' | 'members_only' | 'open' | 'closed';
export type TournamentView =
  | { visible: false }
  | { visible: true; phase: TournamentPhase; canRegister: boolean; tournament: TournamentPublic; tiers: TierState[] };
export type TournamentRegistrationView = {
  id: string; tournamentId: string; tier: string; status: string; amountAed: number; holdExpiresAt: string | null; paidAt: string | null;
  promotedAt: string | null; withdrawnAt: string | null; refundStatus: string | null; tShirtSize: string; company: string | null;
  shareWithSponsors: boolean; sponsorInterest: boolean; createdAt: string | null;
};
export type MyTournamentEntry = {
  tournament: TournamentPublic | null; registration: TournamentRegistrationView | null; eligibleTier: string | null; canRegister: boolean; reason?: string;
};
export type RegisterBody = { tShirtSize: string; company: string; shareWithSponsors: boolean; sponsorInterest: boolean };

const authHeaders = (): Record<string, string> => { const t = getMarketplaceAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };
const KEYS = { config: ['tournament', 'config'], view: ['tournament', 'view'], me: ['tournament', 'me'] } as const;

export function useTournamentEnabled(): boolean {
  const { data } = useQuery<boolean>({
    queryKey: KEYS.config,
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/tournament/config'));
      if (!res.ok) return false;
      const j = await res.json().catch(() => null);
      return j?.tournamentEnabled === true;
    },
    staleTime: Infinity,
    retry: false,
  });
  return data === true;
}

export function useTournamentView() {
  const enabled = useTournamentEnabled();
  return useQuery<TournamentView>({
    queryKey: [...KEYS.view, !!getMarketplaceAccessToken()],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/tournament'), { headers: authHeaders() });
      if (!res.ok) return { visible: false };
      return res.json();
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useMyTournamentEntry() {
  const enabled = useTournamentEnabled() && !!getMarketplaceAccessToken();
  return useQuery<MyTournamentEntry>({
    queryKey: KEYS.me,
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/tournament/me'), { headers: authHeaders() });
      if (!res.ok) throw new Error('tournament me');
      return res.json();
    },
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useTournamentActions() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEYS.view });
    void qc.invalidateQueries({ queryKey: KEYS.me });
  };
  const post = async (path: string, body: Record<string, unknown>): Promise<Record<string, any> | null> => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(errorCopy(j?.error)); refresh(); return null; }
      if (j?.redirectUrl) { await openCheckoutRedirect(j.redirectUrl); return j; }
      refresh();
      return j;
    } catch {
      setError(errorCopy(null));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    clearError: () => setError(null),
    register: async (body: RegisterBody) => { await post('/api/marketplace/tournament/register', { ...body, ...nativeReturnFields() }); },
    pay: async (registrationId: string) => { await post(`/api/marketplace/tournament/registrations/${registrationId}/pay`, { ...nativeReturnFields() }); },
    withdraw: async (registrationId: string) => post(`/api/marketplace/tournament/registrations/${registrationId}/withdraw`, {}),
    setSponsor: async (registrationId: string, interested: boolean) => { await post(`/api/marketplace/tournament/registrations/${registrationId}/sponsor-interest`, { interested }); },
  };
}
