// ShuttleIQ Premier League — shared pieces of the tournament screens (IQ Pass tokens, Inter, no icons):
//   TournamentTierCounter   "Competitive · 12 of 18 filled" per tier, with a thin bar.
//   TournamentWithdrawDialog  the refund rule in plain words before a withdrawal.
//   TournamentEntryView     my entry: status, Pay for a hold, Withdraw, the sponsor tick.
import { useState } from 'react';
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  counterLine, eventLine, statusLine, withdrawDialogCopy,
  type TierState,
} from '@/lib/tournamentCopy';
import type { TournamentPublic, TournamentRegistrationView } from '@/hooks/useTournament';
import { TournamentSponsorCard } from './TournamentSponsorCard';

export const tCard: React.CSSProperties = { background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 12, padding: '16px 18px', fontFamily: IQP_FONT, color: IQP.ink };
export const tEyebrow: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: IQP.teal };
export const tH2: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 18, color: IQP.navy, letterSpacing: '-0.01em' };
export const tSub: React.CSSProperties = { margin: 0, fontFamily: IQP_FONT, fontSize: 14, color: IQP.inkSub, lineHeight: 1.5 };
export const tPrimaryBtn = (disabled?: boolean): React.CSSProperties => ({
  minHeight: 48, padding: '0 20px', borderRadius: 6, border: 'none', background: IQP.teal, color: IQP.white,
  fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, width: '100%',
});
export const tNavyBtn = (disabled?: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 6, border: 'none',
  background: IQP.navy, color: IQP.white, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15, textDecoration: 'none',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
});
export const tGhostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 14px', borderRadius: 6,
  border: `1px solid ${IQP.line}`, background: IQP.white, color: IQP.navy, fontFamily: IQP_FONT, fontWeight: 600, fontSize: 14, cursor: 'pointer', textDecoration: 'none',
};

export function TournamentTierCounter({ tiers, compact }: { tiers: TierState[]; compact?: boolean }) {
  return (
    <div data-testid="list-tournament-tiers" style={{ display: 'grid', gap: compact ? 6 : 10 }}>
      {tiers.map((t) => {
        const pct = Math.max(0, Math.min(100, Math.round((t.held / Math.max(1, t.cap)) * 100)));
        return (
          <div key={t.tier}>
            <span data-testid={`text-tier-count-${t.tier.toLowerCase()}`} style={{ fontFamily: IQP_FONT, fontSize: compact ? 13 : 14, fontWeight: 600, color: IQP.ink }}>{counterLine(t)}</span>
            <div aria-hidden="true" style={{ marginTop: 4, height: compact ? 4 : 6, borderRadius: 999, background: IQP.cream, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: t.state === 'open' ? IQP.teal : IQP.navy, borderRadius: 999 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TournamentWithdrawDialog({ open, onOpenChange, withdrawDeadlineAt, paid, amountAed, onConfirm, busy }: {
  open: boolean; onOpenChange: (open: boolean) => void; withdrawDeadlineAt: string; paid: boolean; amountAed: number; onConfirm: () => void; busy?: boolean;
}) {
  const c = withdrawDialogCopy({ withdrawDeadlineAt, paid, now: new Date(), amountAed });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent style={{ fontFamily: IQP_FONT }}>
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: IQP.navy }}>{c.title}</AlertDialogTitle>
          <AlertDialogDescription data-testid="text-withdraw-rule" style={{ color: IQP.ink, lineHeight: 1.6 }}>{c.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-withdraw">Keep my spot</AlertDialogCancel>
          <AlertDialogAction data-testid="button-confirm-withdraw" disabled={busy} onClick={onConfirm} style={{ background: IQP.navy, color: IQP.white }}>{c.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type EntryActions = { pay(id: string): Promise<void>; withdraw(id: string): Promise<unknown>; setSponsor(id: string, v: boolean): Promise<void>; busy: boolean; error: string | null };

export function TournamentEntryView({ registration: r, tournament: t, actions, showPageLink, compactHeader }: {
  registration: TournamentRegistrationView; tournament: TournamentPublic | null; actions: EntryActions; showPageLink?: boolean;
  /** On the Premier League page the event is already in the page header: show "Your entry" instead of repeating it. */
  compactHeader?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const active = r.status === 'pending_payment' || r.status === 'confirmed' || r.status === 'waitlisted';
  const beforeCutoff = !t || Date.now() < new Date(t.draftCutoffAt).getTime();
  return (
    <div data-testid="card-tournament-entry" data-status={r.status} style={{ ...tCard, display: 'grid', gap: 10 }}>
      {compactHeader ? (
        <p data-testid="text-entry-heading" style={tH2}>Your entry</p>
      ) : (
        <>
          <p style={tEyebrow}>Premier League</p>
          <p style={{ ...tH2, fontSize: 20 }}>{t?.name ?? 'ShuttleIQ Premier League'}</p>
          {t && <p style={tSub}>{eventLine(t)}</p>}
        </>
      )}
      <p data-testid="text-tournament-status" style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 15, fontWeight: 700, color: r.status === 'confirmed' ? IQP.teal : IQP.navy }}>{statusLine(r)}</p>
      <p style={{ ...tSub, fontSize: 13 }}>T-shirt: {r.tShirtSize}{r.company ? ` · ${r.company}` : ''}</p>
      {r.status === 'pending_payment' && (
        <button type="button" data-testid="button-tournament-pay" disabled={actions.busy} onClick={() => { void actions.pay(r.id); }} style={tPrimaryBtn(actions.busy)}>
          Pay AED {r.amountAed}
        </button>
      )}
      {actions.error && <p data-testid="text-tournament-error" role="alert" style={{ margin: 0, fontSize: 13, color: IQP.navy, fontWeight: 600 }}>{actions.error}</p>}
      {active && (
        <TournamentSponsorCard checked={r.sponsorInterest} disabled={actions.busy} onChange={(v) => { void actions.setSponsor(r.id, v); }} />
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {active && beforeCutoff && (
          <button type="button" data-testid="button-tournament-withdraw" onClick={() => setConfirming(true)} style={tGhostBtn}>Withdraw</button>
        )}
        {showPageLink && <Link href="/marketplace/tournament" data-testid="link-tournament-page" style={tGhostBtn}>Premier League page</Link>}
      </div>
      {t && (
        <TournamentWithdrawDialog open={confirming} onOpenChange={setConfirming} withdrawDeadlineAt={t.withdrawDeadlineAt} paid={!!r.paidAt} amountAed={r.amountAed}
          busy={actions.busy} onConfirm={() => { void actions.withdraw(r.id); }} />
      )}
    </div>
  );
}
