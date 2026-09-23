// ShuttleIQ Premier League — the tournament page (public route; registering needs a signed-in player).
// The event, the live per-tier counter, and one of: sign in / finish your profile / the registration form
// (T-shirt size, company, share-with-sponsors, then the sponsorship card, then Pay AED 100) / my entry
// (status, Pay for a hold, Withdraw, the sponsor tick). ?pay=<registrationId> — the promotion email's link —
// starts that payment once. IQ Pass tokens, Inter, no icons, no emoji; words from lib/tournamentCopy.ts.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useMyTournamentEntry, useTournamentActions, useTournamentEnabled, useTournamentView } from '@/hooks/useTournament';
import {
  closedLine, earlyAccessLine, eventLine, errorCopy, refundDeadlineLabel, registerButtonLabel,
  PAGE_NOT_OPEN_YET, PAGE_UNAVAILABLE, SHARE_TICK, SIGN_IN_LABEL, COMPLETE_PROFILE_LABEL,
} from '@/lib/tournamentCopy';
import { TournamentEntryView, TournamentTierCounter, tCard, tEyebrow, tH2, tNavyBtn, tPrimaryBtn, tSub } from '@/components/marketplace/TournamentParts';
import { TournamentSponsorCard } from '@/components/marketplace/TournamentSponsorCard';

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
const fieldLabel: React.CSSProperties = { display: 'grid', gap: 6, fontFamily: IQP_FONT, fontSize: 14, fontWeight: 600, color: IQP.ink };
const field: React.CSSProperties = { minHeight: 44, padding: '0 12px', borderRadius: 6, border: `1px solid ${IQP.line}`, background: IQP.white, fontFamily: IQP_FONT, fontSize: 15, color: IQP.ink };
const tickRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontFamily: IQP_FONT, fontSize: 14, color: IQP.ink, cursor: 'pointer' };
const tickBox: React.CSSProperties = { width: 20, height: 20, accentColor: IQP.teal, margin: 0, flex: '0 0 auto' };

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: IQP.cream, color: IQP.ink, minHeight: '100%', fontFamily: IQP_FONT }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'clamp(20px, 4vw, 32px) 16px clamp(48px, 6vw, 64px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

export default function Tournament() {
  usePageTitle('Premier League');
  const enabled = useTournamentEnabled();
  const { isAuthenticated } = useMarketplaceAuth();
  const { data: view } = useTournamentView();
  const { data: me } = useMyTournamentEntry();
  const actions = useTournamentActions();

  const [size, setSize] = useState('');
  const [company, setCompany] = useState('');
  const [share, setShare] = useState(false);
  const [sponsor, setSponsor] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ?pay=<id>: the promotion email's link. Start that payment once, then drop the parameter.
  const payStarted = useRef(false);
  const registration = me?.registration ?? null;
  useEffect(() => {
    if (payStarted.current || !registration) return;
    const payId = new URLSearchParams(window.location.search).get('pay');
    if (!payId || payId !== registration.id || registration.status !== 'pending_payment') return;
    payStarted.current = true;
    try { window.history.replaceState({}, '', window.location.pathname); } catch { /* ignore */ }
    void actions.pay(payId);
  }, [registration?.id, registration?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) {
    return <Page><div style={tCard}><p data-testid="text-tournament-unavailable" style={{ ...tSub, color: IQP.inkSub }}>{PAGE_UNAVAILABLE}</p></div></Page>;
  }
  if (!view) {
    return <Page><div style={tCard}><p style={tSub}>Loading the Premier League.</p></div></Page>;
  }
  if (!view.visible) {
    return <Page><div style={tCard}><p data-testid="text-tournament-unavailable" style={{ ...tSub, color: IQP.inkSub }}>{PAGE_NOT_OPEN_YET}</p></div></Page>;
  }

  const t = view.tournament;
  const myTier = me?.eligibleTier ?? null;
  const myTierState = myTier ? view.tiers.find((x) => x.tier === myTier) : undefined;
  const full = myTierState?.state === 'full';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!size) { setFormError(errorCopy('invalid_t_shirt_size')); return; }
    setFormError(null);
    void actions.register({ tShirtSize: size, company: company.trim(), shareWithSponsors: share, sponsorInterest: sponsor });
  };

  let action: React.ReactNode = null;
  if (registration) {
    action = <TournamentEntryView registration={registration} tournament={t} actions={actions} compactHeader />;
  } else if (!isAuthenticated) {
    action = (
      <div style={{ ...tCard, display: 'grid', gap: 10 }}>
        <p style={tSub}>Registration needs your ShuttleIQ player account, so we can place you in your tier.</p>
        <Link href="/marketplace/login?from=%2Fmarketplace%2Ftournament" data-testid="link-tournament-sign-in" style={{ ...tNavyBtn(), width: 'fit-content' }}>{SIGN_IN_LABEL}</Link>
      </div>
    );
  } else if (view.phase === 'closed') {
    action = <div style={tCard}><p data-testid="text-tournament-closed" style={{ ...tSub, color: IQP.ink, fontWeight: 600 }}>{closedLine(t.registrationClosesAt)}</p></div>;
  } else if (me?.reason === 'link_player_first') {
    action = (
      <div style={{ ...tCard, display: 'grid', gap: 10 }}>
        <p style={tSub}>{errorCopy('link_player_first')}</p>
        <Link href="/marketplace/complete-profile" data-testid="link-tournament-complete-profile" style={{ ...tNavyBtn(), width: 'fit-content' }}>{COMPLETE_PROFILE_LABEL}</Link>
      </div>
    );
  } else if (!myTier) {
    action = <div style={tCard}><p data-testid="text-tournament-tier-unresolved" style={tSub}>{errorCopy('tier_unresolved')}</p></div>;
  } else if (me?.canRegister) {
    action = (
      <form data-testid="form-tournament-register" onSubmit={submit} noValidate style={{ ...tCard, display: 'grid', gap: 14 }}>
        <p style={tH2}>Register</p>
        <p data-testid="text-your-tier" style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 15, fontWeight: 700, color: IQP.navy }}>You'll play as {myTier}</p>
        {myTierState?.state === 'waitlist' && <p style={tSub}>{myTier} is full. You will join the waitlist and we will tell you if a spot opens.</p>}
        <label style={fieldLabel}>
          T-shirt size
          <select data-testid="select-tshirt-size" value={size} onChange={(e) => setSize(e.target.value)} style={field}>
            <option value="">Choose a size</option>
            {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={fieldLabel}>
          Company (optional)
          <input data-testid="input-company" type="text" maxLength={100} value={company} onChange={(e) => setCompany(e.target.value)} style={field} autoComplete="organization" />
        </label>
        <label style={tickRow}>
          <input data-testid="checkbox-share-with-sponsors" type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} style={tickBox} />
          <span>{SHARE_TICK}</span>
        </label>
        <TournamentSponsorCard checked={sponsor} onChange={setSponsor} />
        {(formError || actions.error) && <p data-testid="text-tournament-form-error" role="alert" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: IQP.navy }}>{formError ?? actions.error}</p>}
        <button type="submit" data-testid="button-tournament-register" disabled={full || actions.busy} style={tPrimaryBtn(full || actions.busy)}>
          {registerButtonLabel(myTierState, t.entryFeeAed)}
        </button>
        <p style={{ ...tSub, fontSize: 13 }}>Withdraw before {refundDeadlineLabel(t.withdrawDeadlineAt)} for a full refund. After that there is no refund.</p>
      </form>
    );
  } else {
    action = <div style={tCard}><p style={tSub}>{errorCopy('registration_not_open')}</p></div>;
  }

  return (
    <Page>
      <div>
        <p style={tEyebrow}>Premier League</p>
        <h1 style={{ margin: '4px 0 0', fontFamily: IQP_FONT, fontWeight: 700, fontSize: 28, color: IQP.navy, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{t.name}</h1>
        <p data-testid="text-tournament-event" style={{ ...tSub, marginTop: 6, color: IQP.ink }}>{eventLine(t)}</p>
        <p style={{ ...tSub, marginTop: 4 }}>48 players · six teams of eight · AED {t.entryFeeAed} entry{t.venueMapUrl ? ' · ' : ''}
          {t.venueMapUrl && <a href={t.venueMapUrl} target="_blank" rel="noopener noreferrer" data-testid="link-tournament-map" style={{ color: IQP.teal, fontWeight: 600 }}>Map</a>}
        </p>
        {view.phase === 'members_only' && (
          <p data-testid="text-tournament-early-access" style={{ ...tSub, marginTop: 8, color: IQP.teal, fontWeight: 600 }}>{earlyAccessLine(t.registrationOpensAt)}</p>
        )}
      </div>
      <div style={{ ...tCard, display: 'grid', gap: 12 }}>
        <p style={tH2}>Spots by tier</p>
        <TournamentTierCounter tiers={view.tiers} />
        <p style={{ ...tSub, fontSize: 13 }}>Your tier is your ShuttleIQ tier on the day you register. Teams are drafted on Sun 11 Oct.</p>
      </div>
      {action}
    </Page>
  );
}
