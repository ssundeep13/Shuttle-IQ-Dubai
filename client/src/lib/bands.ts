// Court skill bands — client mirror of server/matchmaking.ts. Display and
// picker-grouping ONLY: the server owns enforcement (suggestion pools), and
// captain actions are never blocked by band, so a drifted client copy can
// mislabel but never corrupt.

export type CourtSkillBand = 'all_levels' | 'beginner' | 'intermediate_plus' | 'competitive_plus';

export const COURT_SKILL_BANDS: readonly CourtSkillBand[] = [
  'all_levels',
  'beginner',
  'intermediate_plus',
  'competitive_plus',
];

// Display names only — never show raw enums like upper_intermediate.
export const BAND_LABELS: Record<CourtSkillBand, string> = {
  all_levels: 'All levels',
  beginner: 'Beginner',
  intermediate_plus: 'Intermediate+',
  competitive_plus: 'Competitive+',
};

export function bandLabel(band: string | null | undefined): string {
  return BAND_LABELS[(band ?? 'all_levels') as CourtSkillBand] ?? 'All levels';
}

// Confirmed-tier index, mirroring server getConfirmedTierIndex (incl. the
// legacy 'Intermediate'/'Competitive' aliases).
function confirmedTierIndex(level: string): number {
  switch (level) {
    case 'Novice': return 0;
    case 'Beginner': return 1;
    case 'lower_intermediate': return 2;
    case 'Intermediate': return 2; // legacy label
    case 'upper_intermediate': return 3;
    case 'Competitive': return 3; // display-name fallback
    case 'Advanced': return 4;
    case 'Professional': return 5;
    default: return 2;
  }
}

export function playerPassesBand(band: string, level: string): boolean {
  const idx = confirmedTierIndex(level);
  switch (band) {
    case 'beginner': return idx <= 1;
    case 'intermediate_plus': return idx >= 2;
    case 'competitive_plus': return idx >= 3;
    default: return true;
  }
}
