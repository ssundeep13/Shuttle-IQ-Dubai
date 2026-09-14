// IQ Pass — the card for a hold awaiting payment. One component, four homes: the Dashboard slot, the My games hero
// slot (onDark: the hero's navy), the IQ Pass page, and the booking card's compact row. IQ Pass tokens only, Inter,
// no icons, no emoji, flat surfaces.
//   pending  "Hold expires HH:mm" + "Complete payment" (the caller reopens the same Ziina intent)
//   expired  "Hold expired — pick again" — a link to the picker, or a button when the page is the picker itself
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { holdExpiresLabel, pendingPassOf, type PackForPending, type PendingPassState } from '@/lib/iqPassPending';
import { useMinuteNow } from '@/components/marketplace/MyGames';

export const PICK_AGAIN_HREF = '/marketplace/iq-pass?pick=1';
export const PICK_AGAIN_COPY = 'Hold expired — pick again';

const eyebrow = (onDark?: boolean): React.CSSProperties => ({ margin: 0, fontFamily: IQP_FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: onDark ? IQP.cream : IQP.teal, opacity: onDark ? 0.8 : 1 });
const action = (onDark?: boolean, disabled?: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 6, border: 'none',
  backgroundColor: onDark ? IQP.white : IQP.navy, color: onDark ? IQP.navy : IQP.white, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 15,
  textDecoration: 'none', width: 'fit-content', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
});

export function IqPassPendingCard({ state, onComplete, onPickAgain, busy, error, onDark }: {
  state: PendingPassState;
  onComplete: () => void;
  /** On the IQ Pass page itself the expired action opens the tier chooser instead of navigating. */
  onPickAgain?: () => void;
  busy?: boolean;
  error?: string | null;
  onDark?: boolean;
}) {
  const ink = onDark ? IQP.cream : IQP.ink;
  const sub = onDark ? IQP.cream : IQP.inkSub;
  return (
    <section data-testid="card-iq-pass-pending" data-state={state.kind} aria-label={state.kind === 'pending' ? 'IQ Pass waiting for payment' : 'IQ Pass hold expired'}
      style={{ backgroundColor: onDark ? IQP.navy : IQP.white, color: ink, border: onDark ? 'none' : `1px solid ${IQP.line}`, borderRadius: 12, padding: '18px 20px', fontFamily: IQP_FONT, display: 'grid', gap: 10 }}>
      <p style={eyebrow(onDark)}>IQ Pass</p>
      {state.kind === 'pending' ? (
        <>
          <h2 data-testid="text-iq-pass-pending-title" style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 22, fontWeight: 800, color: onDark ? IQP.cream : IQP.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Your {state.label} pass is waiting for payment
          </h2>
          <p data-testid="text-hold-expires" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: onDark ? IQP.cream : IQP.teal, fontVariantNumeric: 'tabular-nums' }}>{holdExpiresLabel(state.holdExpiresAt)}</p>
          <p style={{ margin: 0, fontSize: 14, color: sub, opacity: onDark ? 0.85 : 1 }}>Your games are held until then. Pay now to lock them in.</p>
          <button type="button" data-testid="button-complete-payment" onClick={onComplete} disabled={!!busy} style={action(onDark, busy)}>
            {busy ? 'Opening payment…' : 'Complete payment'}
          </button>
        </>
      ) : (
        <>
          <h2 data-testid="text-iq-pass-pending-title" style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 22, fontWeight: 800, color: onDark ? IQP.cream : IQP.navy, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Your picks were released
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: sub, opacity: onDark ? 0.85 : 1 }}>The 30-minute hold lapsed before payment landed. Pick your games again — the seats may still be free.</p>
          {onPickAgain ? (
            <button type="button" data-testid="button-pick-again" onClick={onPickAgain} style={action(onDark)}>{PICK_AGAIN_COPY}</button>
          ) : (
            <Link href={PICK_AGAIN_HREF} data-testid="link-pick-again" style={action(onDark)}>{PICK_AGAIN_COPY}</Link>
          )}
        </>
      )}
      {error && <p data-testid="text-iq-pass-pending-error" style={{ margin: 0, fontSize: 13, fontWeight: 600, color: onDark ? IQP.cream : IQP.navy }}>{error}</p>}
    </section>
  );
}

/**
 * The slot the pages render: derives the state from the packs list and owns the minute tick, so a hold flips to
 * "expired" on its own without the page (or an inline booking card) re-rendering on a clock. Renders nothing when
 * there is no hold to talk about.
 */
export function IqPassPendingSlot({ packs, onComplete, onPickAgain, busy, error, onDark }: {
  packs: PackForPending[];
  onComplete: (packId: string) => void;
  onPickAgain?: () => void;
  busy?: boolean;
  error?: string | null;
  onDark?: boolean;
}) {
  const now = useMinuteNow();
  const state = pendingPassOf(packs, now);
  if (!state) return null;
  return <IqPassPendingCard state={state} onComplete={() => onComplete(state.packId)} onPickAgain={onPickAgain} busy={busy} error={error} onDark={onDark} />;
}
