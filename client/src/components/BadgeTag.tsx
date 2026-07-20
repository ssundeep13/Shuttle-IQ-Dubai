// Consistency badge tag (badge Gate 3). SHARED component — this is what
// public surfaces (Gate 4) will reuse, so it renders ACTIVE badges only:
// it takes a display name and knows nothing about dormancy. Dormant state
// is an own-profile-only concern rendered locally in Profile.tsx — keeping
// it unrepresentable here is the structural guarantee that dormant badges
// can never leak onto another player's view.
// Brand: 3px radius, Inter 500, navy #003E8C on cream #F5EFE0 text;
// Founding Court is teal #006B5F with white text. No emoji, no icons.

const FF_INTER = "'Inter', system-ui, sans-serif";
const NAVY = '#003E8C';
const CREAM = '#F5EFE0';
const TEAL = '#006B5F';

export default function BadgeTag({ badge, testid }: { badge: string | null | undefined; testid?: string }) {
  if (!badge) return null;
  const founding = badge === 'Founding Court';
  return (
    <span
      data-testid={testid}
      style={{
        display: 'inline-flex', alignItems: 'center',
        borderRadius: 3, padding: '2px 8px',
        fontFamily: FF_INTER, fontWeight: 500, fontSize: 11, letterSpacing: '0.02em',
        background: founding ? TEAL : NAVY,
        color: founding ? '#fff' : CREAM,
        whiteSpace: 'nowrap',
      }}
    >
      {badge}
    </span>
  );
}

/**
 * Date-only render of foundingCourtEarnedDate. The DB column is a naive
 * timestamp whose ISO serialization can shift by hours (Gate 2b caveat),
 * so we slice the date part of the ISO string directly — no Date parsing,
 * no client-timezone double shift, no time component ever shown.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatEarnedDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Progress-card subline. Founding Court returns null — the card shows
 * "Founding Court since <date>" instead (permanent badge, no maintenance
 * messaging). Dormant: check-ins needed to KEEP the badge. Active/none:
 * check-ins to the next badge; an active Inner Circle has already met the
 * top monthly threshold, so it reads as secured.
 */
export function progressSubline(input: {
  badge: string | null;
  badgeStatus: 'active' | 'dormant' | null;
  sessionsToReactivate?: number;
  currentCheckins: number;
  threshold: number;
}): string | null {
  const { badge, badgeStatus, sessionsToReactivate, currentCheckins, threshold } = input;
  if (badge === 'Founding Court') return null;
  if (badgeStatus === 'dormant' && badge) {
    const n = sessionsToReactivate ?? Math.max(0, threshold - currentCheckins);
    return `${n} more to keep ${badge}`;
  }
  if (badge === 'Inner Circle') return 'Inner Circle secured this month';
  if (badge === 'Insider') return `${Math.max(0, 8 - currentCheckins)} more to reach Inner Circle`;
  return `${Math.max(0, 4 - currentCheckins)} more to reach Insider`;
}
