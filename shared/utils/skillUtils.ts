/**
 * Skill Management Utilities
 * Scores: 10–200.
 * Tiers (DB value → display name):
 *   Novice           (10–39)
 *   Beginner         (40–69)
 *   lower_intermediate (70–89)   → displayed as "Intermediate"
 *   upper_intermediate (90–109)  → displayed as "Competitive"
 *   Advanced         (110–159)
 *   Professional     (160–200)
 */

export type SkillTier = 'Novice' | 'Beginner' | 'lower_intermediate' | 'upper_intermediate' | 'Advanced' | 'Professional';

export const SKILL_TIERS: SkillTier[] = [
  'Novice',
  'Beginner',
  'lower_intermediate',
  'upper_intermediate',
  'Advanced',
  'Professional',
];

export const MIN_SKILL_SCORE = 10;
export const MAX_SKILL_SCORE = 200;

// Default starting score (mid-Beginner — safer lower bound for new players)
export const DEFAULT_NEW_PLAYER_SCORE = 50;

// Calibration phase: first 3 games use higher K and a score cap
const CALIBRATION_GAMES = 3;
const CALIBRATION_K_FACTOR = 1.8;
const CALIBRATION_SCORE_CAP = 120;

// Partner contribution: SKID floor prevents division issues; dampening limits range
const CONTRIBUTION_DAMPENING = 0.6;
const CONTRIBUTION_SKID_FLOOR = 1.0;

export function getSkillTier(skillScore: number): SkillTier {
  if (skillScore < 40) return 'Novice';
  if (skillScore < 70) return 'Beginner';
  if (skillScore < 90) return 'lower_intermediate';
  if (skillScore < 110) return 'upper_intermediate';
  if (skillScore < 160) return 'Advanced';
  return 'Professional';
}

/**
 * Return the user-facing display name for a tier DB value.
 * Never show raw DB values (lower_intermediate / upper_intermediate) to users.
 *
 * Brand ruling (F2.1): the public tier ladder has FIVE names only —
 * 'Advanced' is a brand CATEGORY tag (Entry/Developing/Mid level/Advanced/
 * Elite), never a tier name. The DB 'Advanced' enum (110–159) displays as
 * Professional, the public 110+ tier.
 */
export const TIER_DISPLAY_NAMES = ['Novice', 'Beginner', 'Intermediate', 'Competitive', 'Professional'] as const;

export function getTierDisplayName(tier: string): string {
  switch (tier) {
    case 'Novice': return 'Novice';
    case 'Beginner': return 'Beginner';
    case 'lower_intermediate': return 'Intermediate';
    case 'upper_intermediate': return 'Competitive';
    case 'Advanced': return 'Professional';
    case 'Professional': return 'Professional';
    default:
      // Legacy alias rows store display names directly — those are valid.
      if ((TIER_DISPLAY_NAMES as readonly string[]).includes(tier)) return tier;
      // Never leak a raw value into player-facing copy: log and fall back
      // to the mid-ladder name.
      console.error(`[getTierDisplayName] unknown level ${JSON.stringify(tier)} — defaulting to Intermediate`);
      return 'Intermediate';
  }
}

export function calculateSKID(skillScore: number): number {
  return Number((skillScore / 10).toFixed(1));
}

export function getSkillTierRange(tier: SkillTier): string {
  switch (tier) {
    case 'Novice': return '1.0-3.9';
    case 'Beginner': return '4.0-6.9';
    case 'lower_intermediate': return '7.0-8.9';
    case 'upper_intermediate': return '9.0-10.9';
    case 'Advanced': return '11.0-15.9';
    case 'Professional': return '16.0-20.0';
  }
}

export function formatSkillLevel(skillScore: number): string {
  return `${getTierDisplayName(getSkillTier(skillScore))} (${skillScore})`;
}

export function calculateTeamAverage(playerScores: number[]): number {
  if (playerScores.length === 0) return 0;
  return Math.round(playerScores.reduce((acc, s) => acc + s, 0) / playerScores.length);
}

/**
 * K-factor priority (highest to lowest):
 *   gamesPlayed < 3  → K=1.8 (calibration)
 *   returnGamesRemaining > 0 → K=1.2 (return boost after 14+ day absence)
 *   gamesPlayed < 10  → K=1.0
 *   gamesPlayed < 30  → K=0.65
 *   else              → K=0.4
 */
export function getKFactor(gamesPlayed: number, returnGamesRemaining: number = 0): number {
  if (gamesPlayed < CALIBRATION_GAMES) return CALIBRATION_K_FACTOR;
  if (returnGamesRemaining > 0) return 1.2;
  if (gamesPlayed < 10) return 1.0;
  if (gamesPlayed < 30) return 0.65;
  return 0.4;
}

/**
 * Contribution factor based on relative SKID share of the pair.
 * Centered at 1.0: equal partners → 1.0 (current delta unchanged).
 * Stronger player earns/loses more (>1.0); weaker earns/loses less (<1.0).
 * Range ~0.70–1.30 with DAMPENING=0.6. Falls back to 1.0 when partner unknown.
 */
export function getContributionFactor(yourScore: number, partnerScore: number | null | undefined): number {
  if (partnerScore == null) return 1.0;
  const yourSkid = Math.max(CONTRIBUTION_SKID_FLOOR, yourScore / 10);
  const partnerSkid = Math.max(CONTRIBUTION_SKID_FLOOR, partnerScore / 10);
  const partnerWeight = yourSkid / (yourSkid + partnerSkid);
  return 1.0 + (partnerWeight - 0.5) * CONTRIBUTION_DAMPENING;
}

function getTierBounds(score: number): { lower: number; upper: number } {
  if (score < 40) return { lower: MIN_SKILL_SCORE, upper: 40 };
  if (score < 70) return { lower: 40, upper: 70 };
  if (score < 90) return { lower: 70, upper: 90 };
  if (score < 110) return { lower: 90, upper: 110 };
  if (score < 160) return { lower: 110, upper: 160 };
  return { lower: 160, upper: MAX_SKILL_SCORE };
}

/**
 * Calculate post-game skill score.
 * Applies: contribution factor (Fix 1), K-factor with calibration/return boost
 * (Fix 2 / Fix 6), tier boundary protection, and calibration cap.
 *
 * Tier boundary rules:
 *   WIN:  If newScore would cross into the next tier and opponents are below
 *         that tier, cap newScore at playerBounds.upper (the exact boundary).
 *         This allows gradual crossing — a player at the ceiling (e.g. 89) CAN
 *         earn points and reach 90 through consistent wins, but cannot skip
 *         multiple tiers in one game.
 *   LOSS: If newScore would drop below the current tier floor and opponents are
 *         in the same or higher tier, floor at playerBounds.lower (no unfair drop).
 */
export function calculateSkillAdjustment(
  playerScore: number,
  opponentAvgScore: number,
  won: boolean,
  pointDifferential: number = 0,
  gamesPlayed: number = 0,
  partnerScore?: number | null,
  returnGamesRemaining: number = 0
): number {
  const skillDiff = opponentAvgScore - playerScore;
  let baseAdjustment = 0;

  if (won) {
    if (skillDiff > 20)       baseAdjustment = 15;
    else if (skillDiff > 10)  baseAdjustment = 10;
    else if (skillDiff > 0)   baseAdjustment = 8;
    else if (skillDiff > -10) baseAdjustment = 5;
    else if (skillDiff > -20) baseAdjustment = 4;
    else                      baseAdjustment = 2;
    if (pointDifferential > 10) baseAdjustment += 2;
  } else {
    if (skillDiff > 20)       baseAdjustment = -2;
    else if (skillDiff > 10)  baseAdjustment = -4;
    else if (skillDiff > 0)   baseAdjustment = -5;
    else if (skillDiff > -10) baseAdjustment = -8;
    else if (skillDiff > -20) baseAdjustment = -10;
    else                      baseAdjustment = -15;
    if (pointDifferential > 10) baseAdjustment -= 2;
  }

  const contributionFactor = getContributionFactor(playerScore, partnerScore);
  const kFactor = getKFactor(gamesPlayed, returnGamesRemaining);

  let adjustment = Math.round(baseAdjustment * contributionFactor * kFactor);
  if (adjustment === 0) adjustment = won ? 1 : -1;

  let newScore = playerScore + adjustment;

  // Tier boundary protection
  const playerTier = getSkillTier(playerScore);
  const opponentTier = getSkillTier(opponentAvgScore);
  const playerBounds = getTierBounds(playerScore);
  const tierOrder: SkillTier[] = ['Novice', 'Beginner', 'lower_intermediate', 'upper_intermediate', 'Advanced', 'Professional'];

  if (won && newScore >= playerBounds.upper) {
    const targetTierIndex = tierOrder.indexOf(getSkillTier(playerBounds.upper));
    const opponentTierIndex = tierOrder.indexOf(opponentTier);
    // Cap at the boundary itself (not boundary-1) so players at the ceiling can
    // still earn points and gradually cross into the next tier.
    if (opponentTierIndex < targetTierIndex) newScore = Math.min(newScore, playerBounds.upper);
  } else if (!won && newScore < playerBounds.lower) {
    const currentTierIndex = tierOrder.indexOf(playerTier);
    const opponentTierIndex = tierOrder.indexOf(opponentTier);
    if (opponentTierIndex >= currentTierIndex) newScore = playerBounds.lower;
  }

  // Calibration cap: first 3 games cannot exceed 120
  if (gamesPlayed < CALIBRATION_GAMES) newScore = Math.min(newScore, CALIBRATION_SCORE_CAP);

  return Math.max(MIN_SKILL_SCORE, Math.min(MAX_SKILL_SCORE, newScore));
}

/**
 * Normalize legacy level text. Advanced/Professional → lower_intermediate
 * (those tiers must be earned through gameplay, not manually assigned).
 */
export function normalizeLegacySkillLevel(legacyLevel: string): SkillTier {
  const lower = legacyLevel.toLowerCase();
  if (lower.includes('novice')) return 'Novice';
  if (lower.includes('beginner')) return 'Beginner';
  if (lower.includes('intermediate') || lower.includes('competitive')) return 'lower_intermediate';
  return 'lower_intermediate';
}

/**
 * Estimate initial skill score from level text during CSV import.
 * Advanced/Professional are capped at mid-Intermediate (90).
 */
export function estimateScoreFromLegacyLevel(legacyLevel: string): number {
  const lower = legacyLevel.toLowerCase().trim();
  if (lower === 'novice') return 25;
  if (lower === 'beginner-') return 42;
  if (lower === 'beginner') return 50;
  if (lower === 'beginner+') return 62;
  if (lower === 'intermediate-') return 75;
  if (lower === 'intermediate') return 90;
  if (lower === 'intermediate+') return 100;
  if (lower === 'competitive') return 100;
  if (lower.includes('advanced') || lower.includes('professional')) return 90;
  return DEFAULT_NEW_PLAYER_SCORE;
}

// Tier-band palette (audit G5): Novice grey · Beginner blue · Intermediate
// green · Competitive amber · Professional NAVY (was red — red is reserved
// for destructive states, and a top tier should read as prestige).
//
// The band colour lives in the TINT + BORDER, not the text. Measured on the
// cream background, text-success/warning/info sit at 1.8-2.0:1 — far under
// AA — so pill text uses a passing token (foreground ink, or navy for the
// Professional band at 8.9:1) while the tint still carries the identity.
export function getSkillTierColor(tier: string): string {
  if (tier === 'Novice') {
    return 'border-muted-foreground/25 bg-muted text-foreground';
  } else if (tier === 'Beginner') {
    return 'border-info/30 bg-info/10 text-foreground';
  } else if (tier === 'lower_intermediate') {
    return 'border-success/30 bg-success/10 text-foreground';
  } else if (tier === 'upper_intermediate') {
    return 'border-warning/30 bg-warning/10 text-foreground';
  } else if (tier === 'Advanced' || tier === 'Professional') {
    return 'border-primary/30 bg-primary/10 text-primary';
  }
  return 'border-muted bg-muted text-muted-foreground';
}
