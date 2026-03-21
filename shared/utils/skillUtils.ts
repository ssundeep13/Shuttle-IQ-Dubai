/**
 * Skill Management Utilities
 * 
 * ShuttleIQ uses a simplified 5-tier skill system with numeric scores (10-200):
 * - Novice: 10-39 (SKID 1.0-3.9)
 * - Beginner: 40-69 (SKID 4.0-6.9)
 * - Intermediate: 70-109 (SKID 7.0-10.9)
 * - Advanced: 110-159 (SKID 11.0-15.9)
 * - Professional: 160-200 (SKID 16.0-20.0)
 */

export type SkillTier = 'Novice' | 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional';

export const SKILL_TIERS: SkillTier[] = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'];

export const MIN_SKILL_SCORE = 10;
export const MAX_SKILL_SCORE = 200;

// Fix 2: Default starting score lowered from 90 to 50 (low Beginner — safer starting point)
export const DEFAULT_NEW_PLAYER_SCORE = 50;

// Fix 2: Calibration constants
const CALIBRATION_GAMES = 3;
const CALIBRATION_K_FACTOR = 1.8;
const CALIBRATION_SCORE_CAP = 120;

// Fix 1: Contribution factor constants
const CONTRIBUTION_DAMPENING = 0.6;
const CONTRIBUTION_SKID_FLOOR = 1.0;

/**
 * Convert numeric skill score (10-200) to skill tier name
 */
export function getSkillTier(skillScore: number): SkillTier {
  if (skillScore < 40) return 'Novice';
  if (skillScore < 70) return 'Beginner';
  if (skillScore < 110) return 'Intermediate';
  if (skillScore < 160) return 'Advanced';
  return 'Professional';
}

/**
 * Calculate SKID (Skill ID) from skill score
 * SKID is a 1-20 scale derived by dividing skill score by 10
 */
export function calculateSKID(skillScore: number): number {
  return Number((skillScore / 10).toFixed(1));
}

/**
 * Get the tier range as a string for display
 */
export function getSkillTierRange(tier: SkillTier): string {
  switch (tier) {
    case 'Novice': return '1.0-3.9';
    case 'Beginner': return '4.0-6.9';
    case 'Intermediate': return '7.0-10.9';
    case 'Advanced': return '11.0-15.9';
    case 'Professional': return '16.0-20.0';
  }
}

/**
 * Format skill level for display: "Tier (Score)"
 * Example: "Intermediate (85)"
 */
export function formatSkillLevel(skillScore: number): string {
  const tier = getSkillTier(skillScore);
  return `${tier} (${skillScore})`;
}

/**
 * Calculate average skill score for a team
 */
export function calculateTeamAverage(playerScores: number[]): number {
  if (playerScores.length === 0) return 0;
  const sum = playerScores.reduce((acc, score) => acc + score, 0);
  return Math.round(sum / playerScores.length);
}

/**
 * Get K-factor multiplier based on games played and optional return-boost status.
 *
 * Priority order:
 *  1. Return boost (K=1.2) — applies when player returns after 14+ days inactive,
 *     for their first 2 games back (returnGamesRemaining > 0).
 *  2. Calibration (K=1.8) — applies for the first 3 games of a player's career.
 *  3. Standard decay tiers — K=1.0 (games 3-9), K=0.65 (10-29), K=0.4 (30+).
 *
 * Note: return boost takes priority over standard tiers but NOT over calibration.
 * Calibration always uses the highest K (1.8) because that phase matters most.
 */
export function getKFactor(gamesPlayed: number, returnGamesRemaining: number = 0): number {
  if (gamesPlayed < CALIBRATION_GAMES) return CALIBRATION_K_FACTOR;
  if (returnGamesRemaining > 0) return 1.2;
  if (gamesPlayed < 10) return 1.0;
  if (gamesPlayed < 30) return 0.65;
  return 0.4;
}

/**
 * Calculate the contribution factor for a player based on their relative SKID
 * contribution to their team (Fix 1 — partner quality weighting).
 *
 * A player who contributed more skill to a win earns more; contributed less earns less.
 * The dampening factor (0.6) prevents the factor from reaching 0 or 1, so even a
 * very weak partner always gets some credit/blame for the result.
 *
 * Range: 0.20 (weakest) to 0.80 (strongest), 0.50 for equal partners.
 *
 * @param yourScore  Your current skill score
 * @param partnerScore  Your partner's skill score (null = singles or unavailable → factor = 0.5)
 */
export function getContributionFactor(yourScore: number, partnerScore: number | null | undefined): number {
  if (partnerScore == null) return 0.5;

  const yourSkid = Math.max(CONTRIBUTION_SKID_FLOOR, yourScore / 10);
  const partnerSkid = Math.max(CONTRIBUTION_SKID_FLOOR, partnerScore / 10);

  const partnerWeight = yourSkid / (yourSkid + partnerSkid);
  return 0.5 + (partnerWeight - 0.5) * CONTRIBUTION_DAMPENING;
}

/**
 * Get the tier boundary thresholds.
 * Returns [lowerBound, upperBound) for the tier containing the given score.
 */
function getTierBounds(score: number): { lower: number; upper: number } {
  if (score < 40) return { lower: MIN_SKILL_SCORE, upper: 40 };
  if (score < 70) return { lower: 40, upper: 70 };
  if (score < 110) return { lower: 70, upper: 110 };
  if (score < 160) return { lower: 110, upper: 160 };
  return { lower: 160, upper: MAX_SKILL_SCORE };
}

/**
 * Calculate skill score adjustment based on game outcome.
 *
 * Applies three fairness mechanisms (in order):
 *
 * 1. Contribution factor (Fix 1): scales the base delta based on your relative
 *    SKID share of the team. A player carrying a weaker partner earns more;
 *    a player being carried earns less.
 *
 * 2. K-Factor: new players (< 3 games) use K=1.8 for fast calibration.
 *    Returning players (14+ days absent) use K=1.2 for their first 2 games back.
 *    Established players use K=0.65 or 0.4.
 *
 * 3. Tier boundary protection: players cannot promote through tier boundaries
 *    by only beating same-tier or lower-tier opponents.
 *
 * 4. Calibration cap (Fix 2): during the first 3 games, score is capped at 120
 *    to prevent a lucky run pushing a new player into Advanced prematurely.
 *
 * @param playerScore Current player skill score
 * @param opponentAvgScore Average skill score of opposing team
 * @param won Whether the player won the game
 * @param pointDifferential Absolute difference in game score (optional)
 * @param gamesPlayed Number of games the player has played (for K-factor)
 * @param partnerScore Partner's current skill score (null/undefined = singles or unavailable)
 * @param returnGamesRemaining Games remaining in return-boost window (default 0)
 * @returns New skill score (bounded between 10-200)
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
    if (skillDiff > 20) {
      baseAdjustment = 15;
    } else if (skillDiff > 10) {
      baseAdjustment = 10;
    } else if (skillDiff > 0) {
      baseAdjustment = 8;
    } else if (skillDiff > -10) {
      baseAdjustment = 5;
    } else if (skillDiff > -20) {
      baseAdjustment = 4;
    } else {
      baseAdjustment = 2;
    }
    
    if (pointDifferential > 10) {
      baseAdjustment += 2;
    }
  } else {
    if (skillDiff > 20) {
      baseAdjustment = -2;
    } else if (skillDiff > 10) {
      baseAdjustment = -4;
    } else if (skillDiff > 0) {
      baseAdjustment = -5;
    } else if (skillDiff > -10) {
      baseAdjustment = -8;
    } else if (skillDiff > -20) {
      baseAdjustment = -10;
    } else {
      baseAdjustment = -15;
    }
    
    if (pointDifferential > 10) {
      baseAdjustment -= 2;
    }
  }

  // Fix 1: Apply partner contribution factor before K-factor
  const contributionFactor = getContributionFactor(playerScore, partnerScore);

  // Fix 2 / Fix 6: Select K-factor (calibration, return boost, or standard)
  const kFactor = getKFactor(gamesPlayed, returnGamesRemaining);

  let adjustment = Math.round(baseAdjustment * contributionFactor * kFactor);
  
  // Ensure minimum adjustment of 1 point (ratings never completely freeze)
  if (adjustment === 0) {
    adjustment = won ? 1 : -1;
  }

  let newScore = playerScore + adjustment;

  // Tier boundary protection
  const playerTier = getSkillTier(playerScore);
  const opponentTier = getSkillTier(opponentAvgScore);
  const playerBounds = getTierBounds(playerScore);

  if (won && newScore >= playerBounds.upper) {
    const targetTier = getSkillTier(playerBounds.upper);
    const tierOrder: SkillTier[] = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'];
    const opponentTierIndex = tierOrder.indexOf(opponentTier);
    const targetTierIndex = tierOrder.indexOf(targetTier);
    
    if (opponentTierIndex < targetTierIndex) {
      newScore = playerBounds.upper - 1;
    }
  } else if (!won && newScore < playerBounds.lower) {
    const currentTierIndex = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'].indexOf(playerTier);
    const opponentTierIndex = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'].indexOf(opponentTier);
    
    if (opponentTierIndex >= currentTierIndex) {
      newScore = playerBounds.lower;
    }
  }

  // Fix 2: Calibration cap — during first 3 games, score cannot exceed 120
  if (gamesPlayed < CALIBRATION_GAMES) {
    newScore = Math.min(newScore, CALIBRATION_SCORE_CAP);
  }

  // Final bounds check
  return Math.max(MIN_SKILL_SCORE, Math.min(MAX_SKILL_SCORE, newScore));
}

/**
 * Validate and normalize legacy skill level text to new tier system.
 * Advanced and Professional are capped at Intermediate — these tiers
 * are earned through gameplay only and cannot be manually assigned.
 */
export function normalizeLegacySkillLevel(legacyLevel: string): SkillTier {
  const lower = legacyLevel.toLowerCase();
  
  if (lower.includes('novice')) return 'Novice';
  if (lower.includes('beginner')) return 'Beginner';
  if (lower.includes('intermediate')) return 'Intermediate';
  // Advanced and Professional are NOT assignable manually — cap at Intermediate
  if (lower.includes('advanced') || lower.includes('professional')) return 'Intermediate';
  
  return 'Intermediate';
}

/**
 * Estimate initial skill score from level text for import purposes.
 * Operators can only manually assign Novice, Beginner, or Intermediate.
 * Advanced and Professional map to mid-Intermediate (90) — those tiers
 * must be earned through gameplay.
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
  // Advanced / Professional not manually assignable — cap at mid-Intermediate
  if (lower.includes('advanced') || lower.includes('professional')) return 90;
  
  return DEFAULT_NEW_PLAYER_SCORE; // Default to Beginner
}

/**
 * Get color class for skill tier (for UI display)
 * Accepts either a SkillTier or any string for backward compatibility
 */
export function getSkillTierColor(tier: string): string {
  if (tier.includes('Novice') || tier.includes('Beginner')) {
    return 'border-success/20 bg-success/10 text-success';
  } else if (tier.includes('Intermediate')) {
    return 'border-warning/20 bg-warning/10 text-warning';
  } else if (tier.includes('Advanced') || tier.includes('Professional')) {
    return 'border-destructive/20 bg-destructive/10 text-destructive';
  }
  return 'border-muted bg-muted text-muted-foreground';
}
