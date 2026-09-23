// ShuttleIQ Premier League — the Ziina return for a tournament entry (?registration_id=…), rendered by the
// checkout success / cancel pages in place of the booking flow. Success polls the no-auth confirm route
// (the registration UUID is the secret) until Ziina says paid; cancel changes nothing — the hold stays
// until its pay-by time and the player can pay again from the Premier League page or My games.
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { apiUrl } from '@/lib/queryClient';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { tCard, tNavyBtn, tGhostBtn, tSub } from './TournamentParts';

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type State = 'verifying' | 'confirmed' | 'refund_owed' | 'processing' | 'error';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: IQP.cream, minHeight: '100%', padding: 'clamp(24px, 5vw, 48px) 16px', fontFamily: IQP_FONT, color: IQP.ink }}>
      <div style={{ ...tCard, maxWidth: 520, margin: '0 auto', display: 'grid', gap: 12, textAlign: 'center' }}>{children}</div>
    </div>
  );
}
const h1: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 24, color: IQP.navy, letterSpacing: '-0.02em' };
const actions: React.CSSProperties = { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' };

export function TournamentCheckoutResult({ mode, registrationId }: { mode: 'success' | 'cancel'; registrationId: string }) {
  const [state, setState] = useState<State>('verifying');

  useEffect(() => {
    if (mode !== 'success') return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        if (i > 0) await sleep(RETRY_DELAY_MS);
        try {
          const res = await fetch(apiUrl(`/api/marketplace/tournament/registrations/${encodeURIComponent(registrationId)}/confirm`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          });
          const j = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (res.status === 404) { setState('error'); return; }
          if (j?.confirmed) { setState('confirmed'); return; }
          if (j?.error === 'registration_refund_owed') { setState('refund_owed'); return; }
        } catch { /* keep polling */ }
      }
      if (!cancelled) setState('processing');
    })();
    return () => { cancelled = true; };
  }, [mode, registrationId]);

  if (mode === 'cancel') {
    return (
      <Shell>
        <h1 data-testid="text-tournament-cancelled" style={h1}>Payment not completed</h1>
        <p style={tSub}>Nothing was charged. Your spot stays held until your pay-by time. Pay from the Premier League page or My games.</p>
        <div style={actions}>
          <Link href="/marketplace/tournament" data-testid="link-tournament-back" style={tNavyBtn()}>Back to the Premier League</Link>
          <Link href="/marketplace/my-bookings" style={tGhostBtn}>My games</Link>
        </div>
      </Shell>
    );
  }
  if (state === 'verifying') {
    return <Shell><h1 data-testid="text-tournament-verifying" style={h1}>Confirming your payment</h1><p style={tSub}>This takes a few seconds.</p></Shell>;
  }
  if (state === 'confirmed') {
    return (
      <Shell>
        <h1 data-testid="text-tournament-confirmed" style={h1}>You're in the Premier League</h1>
        <p style={tSub}>Your spot is confirmed. Teams are drafted on Sun 11 Oct.</p>
        <div style={actions}>
          <Link href="/marketplace/my-bookings" data-testid="link-tournament-entry" style={tNavyBtn()}>See your entry</Link>
          <Link href="/marketplace/tournament" style={tGhostBtn}>Back to the Premier League</Link>
        </div>
      </Shell>
    );
  }
  if (state === 'refund_owed') {
    return (
      <Shell>
        <h1 style={h1}>Payment received</h1>
        <p data-testid="text-tournament-refund-owed" style={tSub}>Your payment arrived after your spot was released and your tier is now full, so we could not give you a place. Your AED 100 will be refunded manually via Ziina within 5 working days.</p>
        <div style={actions}><Link href="/marketplace/tournament" style={tNavyBtn()}>Back to the Premier League</Link></div>
      </Shell>
    );
  }
  if (state === 'processing') {
    return (
      <Shell>
        <h1 data-testid="text-tournament-processing" style={h1}>Payment still processing</h1>
        <p style={tSub}>We will confirm it automatically. Check My games in a few minutes.</p>
        <div style={actions}><Link href="/marketplace/my-bookings" style={tNavyBtn()}>My games</Link></div>
      </Shell>
    );
  }
  return (
    <Shell>
      <h1 style={h1}>We could not find that entry</h1>
      <div style={actions}><Link href="/marketplace/tournament" style={tNavyBtn()}>Back to the Premier League</Link></div>
    </Shell>
  );
}
