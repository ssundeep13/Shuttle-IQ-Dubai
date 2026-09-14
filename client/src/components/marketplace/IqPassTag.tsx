// IQ Pass tier tag — "Club" / "Club Plus" / "Club Elite" beside a player's
// name on Profile, Who's Playing, the Play screens and Rankings. Colours come
// from the IQ Pass token module (never inlined here); no emoji, no icons, no
// price. Renders nothing for a missing or unknown tier.
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';
import { IQ_PASS_TIER_LABELS, isPackTier } from '@shared/iqPassTiers';

export function IqPassTag({ tier, small, testid }: { tier: string | null | undefined; small?: boolean; testid?: string }) {
  if (!isPackTier(tier)) return null;
  return (
    <span
      data-testid={testid}
      style={{
        display: 'inline-flex', alignItems: 'center',
        borderRadius: 3, padding: small ? '1px 6px' : '2px 8px',
        fontFamily: IQP_FONT, fontWeight: 600, fontSize: small ? 10 : 11, letterSpacing: '0.02em',
        background: IQP.cream, color: IQP.teal, border: `1px solid ${IQP.line}`,
        whiteSpace: 'nowrap',
      }}
    >
      {IQ_PASS_TIER_LABELS[tier]}
    </span>
  );
}
