// IQ Pass tiers — the one place the tier keys and their player-facing labels
// live. Shared by the server rules and the client tag so a label can never
// drift between an API payload and a screen. Never carries prices.
export type PackTier = 'club' | 'club_plus' | 'club_elite';

export const PACK_TIER_ORDER: readonly PackTier[] = ['club', 'club_plus', 'club_elite'] as const;

export const IQ_PASS_TIER_LABELS: Record<PackTier, string> = {
  club: 'Club',
  club_plus: 'Club Plus',
  club_elite: 'Club Elite',
};

export function isPackTier(x: unknown): x is PackTier {
  return typeof x === 'string' && (PACK_TIER_ORDER as readonly string[]).includes(x);
}

/** The highest tier among several (a player holding a current and a next pass shows the higher one). */
export function highestTier(tiers: readonly string[]): PackTier | null {
  let best: PackTier | null = null;
  for (const t of tiers) {
    if (!isPackTier(t)) continue;
    if (best === null || PACK_TIER_ORDER.indexOf(t) > PACK_TIER_ORDER.indexOf(best)) best = t;
  }
  return best;
}
