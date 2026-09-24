// Tournament tiers — the four draft buckets of the ShuttleIQ League.
// A registration freezes the player's CONFIRMED level (players.level) into one
// of these at the moment they register; nothing re-buckets it later.
//
// STRICT on purpose: getTierDisplayName falls back to 'Intermediate' for an
// unknown level, which for a paid, capped entry would put a player in the
// wrong 18-seat bucket. Here an unknown level returns null and the caller
// refuses the registration.
export const TOURNAMENT_TIERS = ['Professional', 'Competitive', 'Intermediate', 'Beginner'] as const;
export type TournamentTier = (typeof TOURNAMENT_TIERS)[number];

export function isTournamentTier(value: unknown): value is TournamentTier {
  return typeof value === 'string' && (TOURNAMENT_TIERS as readonly string[]).includes(value);
}

/**
 * players.level → tournament tier. Novice registers as Beginner (spec, 22 Sep 2026);
 * DB 'Advanced' is the public Professional tier (brand ruling). The legacy
 * display-name aliases getTierDisplayName accepts are accepted too.
 */
export function tournamentTierFor(level: string | null | undefined): TournamentTier | null {
  switch (level) {
    case 'Novice':
    case 'Beginner':
      return 'Beginner';
    case 'lower_intermediate':
    case 'Intermediate':
      return 'Intermediate';
    case 'upper_intermediate':
    case 'Competitive':
      return 'Competitive';
    case 'Advanced':
    case 'Professional':
      return 'Professional';
    default:
      return null;
  }
}
