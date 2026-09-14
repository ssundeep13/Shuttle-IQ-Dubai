// IQ Pass — buy a pass (tier → pick every game from the rolling 4-week
// calendar → "Your month is locked" → one Ziina payment) and manage the pass
// you hold (games, Move, free re-pick, buy the next one). Prices come from the
// server's tier table (calendar payload) so the UI never re-derives money;
// nothing here shows per-game maths or a discount claim. IQ Pass token module only.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiUrl, getMarketplaceAccessToken } from '@/lib/queryClient';
import { openCheckoutRedirect, nativeReturnFields } from '@/lib/nativeAuth';
import { useIqPassEnabled } from '@/hooks/useIqPass';
import { useCompleteIqPassPayment } from '@/hooks/useIqPassPending';
import { IqPassPendingCard } from '@/components/marketplace/IqPassPending';
import { pendingPassOf } from '@/lib/iqPassPending';
import { useMinuteNow } from '@/components/marketplace/MyGames';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { PACK_TIER_ORDER, type PackTier } from '@shared/iqPassTiers';
import { IqPassMoveDialog, MOVE_ERROR_COPY, dubaiDayLabel, type IqPassCalendarSession } from '@/components/marketplace/IqPassMoveDialog';
import { IqPassPicker, MiniMonth } from '@/components/marketplace/IqPassPicker';
import { useViewportWidth, BOTTOM_NAV_MAX } from '@/hooks/useViewportWidth';
import { usePageTitle } from '@/hooks/usePageTitle';

type TierInfo = { label: string; games: number; priceAed: number };
type Calendar = {
  window: { start: string; end: string };
  currentPass: { id: string; tier: PackTier; label: string; gamesTotal: number; lastGameDate: string | null } | null;
  jerseyEligibleForElite: boolean;
  tiers: Record<PackTier, TierInfo>;
  sessions: IqPassCalendarSession[];
};
type MyPack = {
  id: string; tier: string; label: string; status: string; gamesTotal: number; repickCredits: number;
  jerseySize: string | null; jerseyHandedOverAt: string | null; paidAt: string | null; holdExpiresAt: string; cancellationReason: string | null; lastGameDate: string | null;
  seats: Array<{ bookingId: string; sessionId: string; status: string; session: { title: string; venueName: string; date: string; startTime: string; endTime: string }; canMoveUntil: string; canMove: boolean }>;
};

const JERSEY_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const authHeaders = (): Record<string, string> => { const t = getMarketplaceAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };
const ymdOf = (d: string) => String(d).slice(0, 10);

const PURCHASE_ERROR_COPY: Record<string, string> = {
  pack_cap_reached: 'No IQ Pass seats left on one of your picks. Choose another game for that day.',
  session_full: 'One of your picks is now full. Choose another game.',
  already_booked: 'You already have a booking on one of your picks. Choose another game.',
  hold_in_progress: 'You already have a pass waiting for payment. Finish that one, or wait 30 minutes for the hold to lapse.',
  jersey_size_required: 'Pick a jersey size to continue.',
  invalid_jersey_size: 'Pick a jersey size from the list.',
  pick_count: 'Pick the full number of games for this pass.',
  out_of_window: 'One of your picks falls outside the four-week window.',
  payment_start_failed: 'We could not start the card payment. Please try again in a moment.',
};

const card: React.CSSProperties = { background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 9, padding: 16 };
const h2: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 18, color: IQP.navy, letterSpacing: '-0.01em' };
const sub: React.CSSProperties = { margin: '4px 0 0', fontFamily: IQP_FONT, fontSize: 14, color: IQP.inkSub, lineHeight: 1.5 };
const primaryBtn = (disabled?: boolean): React.CSSProperties => ({
  minHeight: 48, padding: '0 20px', borderRadius: 6, border: 'none', background: IQP.teal, color: IQP.white,
  fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, width: '100%',
});
const ghostBtn: React.CSSProperties = {
  minHeight: 44, padding: '0 14px', borderRadius: 6, border: `1px solid ${IQP.line}`, background: IQP.white, color: IQP.navy,
  fontFamily: IQP_FONT, fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

export default function IqPass() {
  usePageTitle('IQ Pass');
  const enabled = useIqPassEnabled();
  const queryClient = useQueryClient();
  // ?pick=1 (the "Hold expired — pick again" link) lands straight on the tier chooser.
  const [step, setStep] = useState<'home' | 'tiers' | 'picks' | 'review'>(() => (new URLSearchParams(window.location.search).get('pick') === '1' ? 'tiers' : 'home'));
  const [tier, setTier] = useState<PackTier | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [jerseySize, setJerseySize] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveFor, setMoveFor] = useState<{ bookingId: string; sessionId: string } | null>(null);
  const [repickFor, setRepickFor] = useState<string | null>(null);
  const [repickTarget, setRepickTarget] = useState<string | null>(null);
  const width = useViewportWidth();

  const me = useQuery<{ packs: MyPack[] }>({
    queryKey: ['/api/marketplace/iq-pass/me'],
    queryFn: async () => { const r = await fetch(apiUrl('/api/marketplace/iq-pass/me'), { headers: authHeaders() }); if (!r.ok) throw new Error('me'); return r.json(); },
    enabled,
    staleTime: 0,
  });
  const cal = useQuery<Calendar>({
    queryKey: ['/api/marketplace/iq-pass/calendar'],
    queryFn: async () => { const r = await fetch(apiUrl('/api/marketplace/iq-pass/calendar'), { headers: authHeaders() }); if (!r.ok) throw new Error('calendar'); return r.json(); },
    enabled,
    staleTime: 15_000,
  });

  const packs = me.data?.packs ?? [];
  const activePacks = packs.filter((p) => p.status === 'active');
  // A hold awaiting payment (live → Complete payment; lapsed or swept → pick again); ticks by the minute so it flips on its own.
  const nowTick = useMinuteNow();
  const pending = pendingPassOf(packs, nowTick);
  const resume = useCompleteIqPassPayment();
  const tiers = cal.data?.tiers;
  const games = tier && tiers ? tiers[tier].games : 0;
  const jerseyNeeded = tier === 'club_elite' && !!cal.data?.jerseyEligibleForElite;
  const canContinue = !!tier && picks.length === games && (!jerseyNeeded || JERSEY_SIZES.includes(jerseySize));
  const pickedSessions = picks.map((id) => cal.data?.sessions.find((x) => x.id === id)).filter((x): x is IqPassCalendarSession => !!x);

  // While a hold is live or has just lapsed the card stands alone; "pick again" opens the chooser.
  const showTiers = step === 'tiers' || (step === 'home' && activePacks.length === 0 && pending == null);

  const togglePick = (id: string) => {
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < games ? [...p, id] : p));
  };

  const pay = async () => {
    if (!tier || !canContinue) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(apiUrl('/api/marketplace/iq-pass/purchase'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ tier, sessionIds: picks, ...(jerseyNeeded ? { jerseySize } : {}), ...nativeReturnFields() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(PURCHASE_ERROR_COPY[j?.error] ?? 'Could not start your IQ Pass. Please try again.'); return; }
      if (!j.redirectUrl) { setError('No payment link was returned. Please try again.'); return; }
      await openCheckoutRedirect(j.redirectUrl);
    } catch {
      setError('Could not start your IQ Pass. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const repick = async () => {
    if (!repickFor || !repickTarget) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(apiUrl(`/api/marketplace/iq-pass/packs/${repickFor}/repick`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ toSessionId: repickTarget }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(MOVE_ERROR_COPY[j?.error] ?? 'Could not book the re-pick. Please try again.'); return; }
      setRepickFor(null); setRepickTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/iq-pass/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    return (
      <div style={{ background: IQP.cream, minHeight: '100%', padding: '32px 16px', fontFamily: IQP_FONT }}>
        <div style={{ ...card, maxWidth: 560, margin: '0 auto' }}>
          <p data-testid="text-iq-pass-unavailable" style={{ margin: 0, color: IQP.inkSub }}>IQ Pass is not available right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: IQP.cream, color: IQP.ink, minHeight: '100%', fontFamily: IQP_FONT }}>
      <div style={{ maxWidth: step === 'picks' ? 960 : 640, margin: '0 auto', padding: 'clamp(20px, 4vw, 32px) 16px clamp(48px, 6vw, 64px)', display: 'grid', gap: 16 }}>
        <div>
          {(step === 'picks' || step === 'review') && tier && tiers && cal.data ? (
            <>
              <p data-testid="text-eyebrow" style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: IQP.teal }}>IQ Pass</p>
              <h1 data-testid={step === 'review' ? 'text-review-title' : 'text-step-title'} style={{ margin: '4px 0 0', fontFamily: IQP_FONT, fontWeight: 800, fontSize: 28, color: IQP.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {step === 'review' ? 'Your month is locked' : `${tiers[tier].label} — pick your ${games} games`}
              </h1>
              {step === 'picks' && <p style={sub}>{dubaiDayLabel(cal.data.window.start)} to {dubaiDayLabel(cal.data.window.end)}, any venue. Moves are free until five hours before a game.</p>}
            </>
          ) : (
            <>
              <h1 style={{ margin: 0, fontFamily: IQP_FONT, fontWeight: 800, fontSize: 28, color: IQP.navy, letterSpacing: '-0.02em' }}>IQ Pass</h1>
              <p style={sub}>Pick your games for the month up front, pay once, play.</p>
            </>
          )}
        </div>

        {(me.isError || cal.isError) && (
          <div style={card}><p style={{ ...sub, margin: 0 }}>Could not load IQ Pass right now. Pull to refresh or try again shortly.</p></div>
        )}

        {/* ── Passes I hold ── */}
        {/* Only on the home step — never over the picker or the review. */}
        {step === 'home' && pending && (
          <IqPassPendingCard state={pending} onComplete={() => { void resume.complete(pending.packId); }} busy={resume.busy} error={resume.error}
            onPickAgain={pending.kind === 'expired' ? () => { setStep('tiers'); setTier(null); setPicks([]); setError(null); } : undefined} />
        )}
        {activePacks.map((p) => {
          const today = ymdOf(new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString());
          const ahead = p.seats.filter((s) => s.status === 'confirmed' && ymdOf(s.session.date) >= today).length;
          return (
            <div key={p.id} style={card} data-testid={`card-my-pass-${p.id}`}>
              <h2 style={h2}>{p.label}</h2>
              <p style={sub}>
                {ahead} of {p.gamesTotal} games ahead
                {p.repickCredits > 0 ? ` · ${p.repickCredits} free re-pick${p.repickCredits === 1 ? '' : 's'}` : ''}
                {p.jerseySize ? ` · Jersey ${p.jerseySize}${p.jerseyHandedOverAt ? ' (handed over)' : ''}` : ''}
              </p>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {p.seats.map((s) => (
                  <div key={s.bookingId} data-testid={`row-seat-${s.bookingId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${IQP.line}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{dubaiDayLabel(ymdOf(s.session.date))} · {s.session.startTime}–{s.session.endTime}</div>
                      <div style={{ fontSize: 12, color: IQP.inkSub }}>{s.session.venueName}{s.status !== 'confirmed' ? ` · ${s.status}` : ''}</div>
                    </div>
                    {s.canMove && (
                      <button type="button" style={ghostBtn} onClick={() => setMoveFor({ bookingId: s.bookingId, sessionId: s.sessionId })} data-testid={`button-move-${s.bookingId}`}>Move</button>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {p.repickCredits > 0 && (
                  <button type="button" style={ghostBtn} onClick={() => { setRepickFor(p.id); setRepickTarget(null); setError(null); }} data-testid={`button-repick-${p.id}`}>Use free re-pick</button>
                )}
                <button type="button" style={ghostBtn} onClick={() => { setStep('tiers'); setTier(null); setPicks([]); setError(null); }} data-testid="button-buy-next">Buy your next pass</button>
              </div>
            </div>
          );
        })}

        {/* ── Free re-pick picker ── */}
        {repickFor && (
          <div style={card} data-testid="card-repick">
            <h2 style={h2}>Choose a game for your free re-pick</h2>
            <div style={{ display: 'grid', gap: 6, marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
              {(cal.data?.sessions ?? []).filter((s) => !s.alreadyBooked && s.spotsRemaining > 0).map((s) => (
                <button key={s.id} type="button" aria-pressed={repickTarget === s.id} onClick={() => setRepickTarget(s.id)} data-testid={`repick-row-${s.id}`}
                  style={{ ...ghostBtn, textAlign: 'left', background: repickTarget === s.id ? IQP.navy : IQP.white, color: repickTarget === s.id ? IQP.white : IQP.ink }}>
                  {dubaiDayLabel(s.dateDubai)} · {s.startTime}–{s.endTime} · {s.venueName}
                </button>
              ))}
            </div>
            {error && <p data-testid="text-repick-error" style={{ ...sub, color: IQP.navy }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" style={ghostBtn} onClick={() => { setRepickFor(null); setRepickTarget(null); }}>Not now</button>
              <button type="button" style={{ ...primaryBtn(!repickTarget || busy), width: 'auto' }} disabled={!repickTarget || busy} onClick={repick} data-testid="button-repick-confirm">{busy ? 'Booking…' : 'Book this game'}</button>
            </div>
          </div>
        )}

        {/* ── Step 1: tiers ── */}
        {showTiers && tiers && (
          <div style={{ display: 'grid', gap: 10 }}>
            <h2 style={h2}>{activePacks.length ? 'Your next pass' : 'Choose your pass'}</h2>
            {cal.data?.currentPass && (
              <p style={sub}>Your next pass opens the day after your current last game — picks run from {dubaiDayLabel(cal.data.window.start)}.</p>
            )}
            {PACK_TIER_ORDER.map((t) => (
              <button key={t} type="button" onClick={() => { setTier(t); setPicks([]); setJerseySize(''); setError(null); setStep('picks'); }} data-testid={`card-tier-${t}`}
                style={{ ...card, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: IQP_FONT }}>
                <span>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 17, color: IQP.navy }}>{tiers[t].label}</span>
                  <span style={{ display: 'block', fontSize: 14, color: IQP.inkSub, marginTop: 2 }}>{tiers[t].games} games · any venue · pick them all now</span>
                </span>
                <span style={{ fontWeight: 700, fontSize: 17, color: IQP.teal, whiteSpace: 'nowrap' }}>AED {tiers[t].priceAed}</span>
              </button>
            ))}
            {activePacks.length > 0 && step === 'tiers' && (
              <button type="button" style={ghostBtn} onClick={() => setStep('home')}>Back</button>
            )}
          </div>
        )}

        {/* ── Step 2: picks (Gate 11: week overlines + session cards, sticky slot bar) ── */}
        {step === 'picks' && tier && tiers && cal.data && (
          <div style={{ display: 'grid', gap: 12 }}>
            <IqPassPicker
              windowStart={cal.data.window.start}
              windowEnd={cal.data.window.end}
              sessions={cal.data.sessions}
              picks={picks}
              games={games}
              onToggle={togglePick}
              onReview={() => setStep('review')}
              canReview={canContinue}
              reviewHint={jerseyNeeded && !JERSEY_SIZES.includes(jerseySize) ? 'Pick your jersey size to review.' : ''}
            />
            {jerseyNeeded && (
              <div style={card}>
                <label htmlFor="jersey-size" style={{ display: 'block', fontWeight: 700, fontSize: 14, color: IQP.navy }}>Your Club Elite jersey size</label>
                <p style={sub}>Included with your first Club Elite pass. We hand it over at your next session.</p>
                <select id="jersey-size" value={jerseySize} onChange={(e) => setJerseySize(e.target.value)} data-testid="select-jersey-size"
                  style={{ marginTop: 8, minHeight: 44, width: '100%', borderRadius: 6, border: `1px solid ${IQP.line}`, padding: '0 10px', fontFamily: IQP_FONT, background: IQP.white, color: IQP.ink }}>
                  <option value="">Choose a size</option>
                  {JERSEY_SIZES.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={ghostBtn} onClick={() => { setStep(activePacks.length ? 'home' : 'tiers'); setTier(null); setPicks([]); }}>Back</button>
            </div>
          </div>
        )}
        {/* ── Step 3: review (Gate 11: picks as tiles on a mini month, Pay pinned) ── */}
        {step === 'review' && tier && tiers && cal.data && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={card}>
              <p style={{ ...sub, margin: 0 }}>{tiers[tier].label} · {games} games{jerseyNeeded ? ` · jersey ${jerseySize}` : ''}</p>
              <div style={{ marginTop: 12 }}>
                <MiniMonth windowStart={cal.data.window.start} windowEnd={cal.data.window.end} picks={pickedSessions} />
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {pickedSessions.map((s) => (
                  <div key={s.id} style={{ padding: '8px 0', borderTop: `1px solid ${IQP.line}`, fontSize: 14 }}>
                    <span style={{ fontWeight: 600 }}>{dubaiDayLabel(s.dateDubai)} · {s.startTime}–{s.endTime}</span>
                    <span style={{ color: IQP.inkSub }}> · {s.venueName}{s.venueArea ? `, ${s.venueArea}` : ''}</span>
                  </div>
                ))}
              </div>
              <p style={{ ...sub, marginTop: 12 }}>Games you do not play expire with the pass. You can move a game until five hours before it starts.</p>
            </div>
            {error && <p data-testid="text-purchase-error" style={{ ...sub, color: IQP.navy, margin: 0 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={ghostBtn} onClick={() => setStep('picks')} disabled={busy}>Change picks</button>
            </div>
            {/* Pay pinned to the bottom; above the fixed bottom nav on phones */}
            {/* z-45: above the InstallAppBar (fixed to the same bottom edge at z-40), below the sticky header (z-50). */}
            <div data-testid="bar-pay" style={{ position: 'fixed', left: 0, right: 0, bottom: width <= BOTTOM_NAV_MAX ? 64 : 0, marginBottom: width <= BOTTOM_NAV_MAX ? 'env(safe-area-inset-bottom)' : 0, zIndex: 45, padding: '10px 16px', background: IQP.white, borderTop: `1px solid ${IQP.line}` }}>
              <div style={{ maxWidth: 608, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link href="/iq-pass/terms" data-testid="link-iq-pass-terms" style={{ fontFamily: IQP_FONT, fontSize: 13, fontWeight: 600, color: IQP.teal, flex: 1 }}>IQ Pass terms</Link>
                <button type="button" style={{ ...primaryBtn(busy), width: 'auto', minWidth: 160 }} disabled={busy} onClick={pay} data-testid="button-pay">{busy ? 'Starting payment…' : `Pay AED ${tiers[tier].priceAed}`}</button>
              </div>
            </div>
            <div aria-hidden="true" style={{ height: 72 }} />
          </div>
        )}
        <p style={{ ...sub, textAlign: 'center' }}>
          <Link href="/marketplace/my-bookings" style={{ color: IQP.teal, fontWeight: 600 }}>My Bookings</Link>
        </p>
      </div>

      {moveFor && (
        <IqPassMoveDialog
          open
          onOpenChange={(o) => { if (!o) setMoveFor(null); }}
          bookingId={moveFor.bookingId}
          currentSessionId={moveFor.sessionId}
          onMoved={() => {
            setMoveFor(null);
            queryClient.invalidateQueries({ queryKey: ['/api/marketplace/iq-pass/me'] });
            queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
            queryClient.invalidateQueries({ queryKey: ['/api/marketplace/iq-pass/calendar'] });
          }}
        />
      )}
    </div>
  );
}
