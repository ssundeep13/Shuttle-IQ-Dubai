// IQ Pass — a hold awaiting payment (Sandeep, 2026-09-14). Its own module so the page suites' fixed-export mocks of
// useIqPass keep working.
//  • useMyPacks: GET /api/marketplace/iq-pass/me — every pack the player holds (pending, active, cancelled…), fresh
//    on every mount, flag on only. Same query key as the IQ Pass page and My games, so one fetch feeds them all.
//  • useCompleteIqPassPayment: "Complete payment" — POST /iq-pass/packs/:id/resume reopens the SAME Ziina intent and
//    we open it. Money already taken → the pass is confirmed and the screens refresh. hold_expired → refresh, and the
//    card flips to "Hold expired — pick again" on its own.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiUrl, getMarketplaceAccessToken } from '@/lib/queryClient';
import { openCheckoutRedirect, nativeReturnFields } from '@/lib/nativeAuth';
import { useIqPassEnabled } from '@/hooks/useIqPass';

export type MyPackSummary = {
  id: string; tier: string; label: string; status: string; gamesTotal: number; paidAt: string | null;
  holdExpiresAt: string; cancellationReason: string | null; lastGameDate: string | null;
};

const authHeaders = (): Record<string, string> => { const t = getMarketplaceAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

export function useMyPacks() {
  const enabled = useIqPassEnabled();
  return useQuery<{ packs: MyPackSummary[] }>({
    queryKey: ['/api/marketplace/iq-pass/me'],
    queryFn: async () => { const r = await fetch(apiUrl('/api/marketplace/iq-pass/me'), { headers: authHeaders() }); if (!r.ok) throw new Error('me'); return r.json(); },
    enabled,
    staleTime: 0,
    retry: false,
  });
}

const RESUME_ERROR_COPY: Record<string, string> = {
  intent_unavailable: 'That payment can no longer be opened. Once the hold lapses you can pick again.',
  hold_expired: 'This hold has expired. Pick your games again.',
  platform_mismatch: 'This payment was started on another device or in the app. Finish it there, or wait for the hold to lapse and pick again.',
};
const GENERIC = 'Could not reopen the payment. Please try again.';

export function useCompleteIqPassPayment(): { complete: (packId: string) => Promise<void>; busy: boolean; error: string | null } {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['/api/marketplace/iq-pass/me'] });
    void qc.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
  };
  const complete = async (packId: string) => {
    setBusy(true); setError(null);
    try {
      // The platform rides along (deep-link scheme on native) so the server can refuse an intent minted for the other one.
      const r = await fetch(apiUrl(`/api/marketplace/iq-pass/packs/${packId}/resume`), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(nativeReturnFields()) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.redirectUrl) { await openCheckoutRedirect(j.redirectUrl); return; }
      if (r.ok && j?.confirmed) { refresh(); return; }
      // The hold lapsed under the button: refresh so the card flips, and say so in case the minute tick is behind.
      if (j?.error === 'hold_expired') { refresh(); setError(RESUME_ERROR_COPY.hold_expired); return; }
      setError(RESUME_ERROR_COPY[j?.error] ?? GENERIC);
    } catch {
      setError(GENERIC);
    } finally {
      setBusy(false);
    }
  };
  return { complete, busy, error };
}
