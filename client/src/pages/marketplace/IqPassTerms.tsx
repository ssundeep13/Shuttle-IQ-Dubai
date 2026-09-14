// IQ Pass terms — /iq-pass/terms. Eleven clauses, verbatim from Sandeep (2026-09-14);
// any wording change is a product decision, not a code one. IQ Pass tokens (IQP),
// Inter via the token font, mobile-first, no icons, no emoji. Flag-gated like the
// purchase page: with IQ_PASS_ENABLED off it shows the same "not available" notice.
import { Link } from 'wouter';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { useIqPassEnabled } from '@/hooks/useIqPass';
import { usePageTitle } from '@/hooks/usePageTitle';

export const IQ_PASS_TERMS: readonly string[] = [
  'An IQ Pass is a prepaid pack of 4, 8 or 12 session seats (Club, Club Plus, Club Elite), paid once via Ziina.',
  'All sessions are chosen at purchase from the next 4 weeks. Seats are held for 30 minutes until payment completes.',
  "Pass seats are limited to half of each session's capacity.",
  'You may move any pass seat to another eligible session, as many times as you like, up to 5 hours before the session you are moving from. Moves are made in the app.',
  'Pass seats cannot be cancelled and are non-refundable. Unused seats expire at the end of the pass.',
  'If ShuttleIQ cancels a session, you receive a free re-pick for that seat, usable while the pass is active.',
  "One active IQ Pass per player. A next pass can be bought at any time; its 4-week window starts the day after your current pass's last session.",
  'Guests may be added to a pass seat at the standard drop-in price.',
  'Club Elite includes one ShuttleIQ jersey on your first Club Elite purchase, in the size chosen at checkout.',
  'ShuttleIQ may change pass prices and tiers for future purchases; an active pass is not affected.',
  'These terms sit alongside the general ShuttleIQ terms and code of conduct.',
];

export default function IqPassTerms() {
  usePageTitle('IQ Pass Terms');
  const enabled = useIqPassEnabled();

  if (!enabled) {
    return (
      <div style={{ background: IQP.cream, minHeight: '100%', padding: '32px 16px', fontFamily: IQP_FONT }}>
        <div style={{ maxWidth: 560, margin: '0 auto', background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 9, padding: 16 }}>
          <p data-testid="text-iq-pass-unavailable" style={{ margin: 0, color: IQP.inkSub }}>IQ Pass is not available right now.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: IQP.cream, color: IQP.ink, minHeight: '100%', fontFamily: IQP_FONT }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px 48px', display: 'grid', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: IQP_FONT, fontWeight: 700, fontSize: 28, color: IQP.navy, letterSpacing: '-0.02em' }}>IQ Pass Terms</h1>
        </div>
        <div style={{ background: IQP.white, border: `1px solid ${IQP.line}`, borderRadius: 9, padding: '4px 16px' }}>
          <ol style={{ margin: 0, padding: '0 0 0 22px', display: 'grid' }}>
            {IQ_PASS_TERMS.map((clause, i) => (
              <li key={i} data-testid={`text-iq-pass-term-${i + 1}`} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${IQP.line}`, fontSize: 15, lineHeight: 1.55, color: IQP.ink }}>
                {clause}
              </li>
            ))}
          </ol>
        </div>
        <p style={{ margin: 0, fontFamily: IQP_FONT, fontSize: 14, color: IQP.inkSub, textAlign: 'center' }}>
          <Link href="/marketplace/iq-pass" data-testid="link-iq-pass-back" style={{ color: IQP.teal, fontWeight: 600 }}>IQ Pass</Link>
        </p>
      </div>
    </div>
  );
}
