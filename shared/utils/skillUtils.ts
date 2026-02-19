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
 * Get K-factor multiplier based on games played.
 * New players have volatile ratings that settle over time.
 * 
 * - <10 games: 1.0 (full adjustments, rating is being discovered)
 * - 10-30 games: 0.65 (settling into range)
 * - 30+ games: 0.4 (stable, established rating)
 */
export function getKFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 1.0;
  if (gamesPlayed < 30) return 0.65;
  return 0.4;
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
 * Calculate skill score adjustment based on game outcome
 * 
 * Uses ELO-style rating system with two stabilization mechanisms:
 * 
 * 1. K-Factor Decay: Adjustments shrink as players play more games,
 *    so established players have stable ratings.
 * 
 * 2. Tier Boundary Protection: Players cannot cross into a higher tier
 *    by beating same-tier or lower-tier opponents. To promote into a
 *    new tier, you must beat opponents from that tier or above.
 *    Similarly, you won't demote by losing to same-tier or higher-tier
 *    opponents.
 * 
 * @param playerScore Current player skill score
 * @param opponentAvgScore Average skill score of opposing team
 * @param won Whether the player won the game
 * @param pointDifferential Absolute difference in game score (optional)
 * @param gamesPlayed Number of games the player has played (for K-factor)
 * @returns New skill score (bounded between 10-200)
 */
export function calculateSkillAdjustment(
  playerScore: number,
  opponentAvgScore: number,
  won: boolean,
  pointDifferential: number = 0,
  gamesPlayed: number = 0
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

  // Apply K-factor decay based on games played
  const kFactor = getKFactor(gamesPlayed);
  let adjustment = Math.round(baseAdjustment * kFactor);
  
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
    // Trying to promote: only allow if opponent is from the higher tier or above
    const targetTier = getSkillTier(playerBounds.upper);
    const tierOrder: SkillTier[] = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'];
    const opponentTierIndex = tierOrder.indexOf(opponentTier);
    const targetTierIndex = tierOrder.indexOf(targetTier);
    
    if (opponentTierIndex < targetTierIndex) {
      // Opponent is from same tier or lower — cap at 1 below boundary
      newScore = playerBounds.upper - 1;
    }
  } else if (!won && newScore < playerBounds.lower) {
    // Trying to demote: only allow if opponent is from the lower tier or below
    const currentTierIndex = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'].indexOf(playerTier);
    const opponentTierIndex = ['Novice', 'Beginner', 'Intermediate', 'Advanced', 'Professional'].indexOf(opponentTier);
    
    if (opponentTierIndex >= currentTierIndex) {
      // Opponent is from same tier or higher — cap at lower boundary
      newScore = playerBounds.lower;
    }
  }

  // Final bounds check
  return Math.max(MIN_SKILL_SCORE, Math.min(MAX_SKILL_SCORE, newScore));
}

/**
 * Validate and normalize legacy skill level text to new tier system
 * Handles backward compatibility with old 10-tier system
 */
export function normalizeLegacySkillLevel(legacyLevel: string): SkillTier {
  const lower = legacyLevel.toLowerCase();
  
  if (lower.includes('novice')) return 'Novice';
  if (lower.includes('beginner')) return 'Beginner';
  if (lower.includes('intermediate')) return 'Intermediate';
  if (lower.includes('advanced')) return 'Advanced';
  if (lower.includes('professional')) return 'Professional';
  
  // Default to Intermediate if unknown
  return 'Intermediate';
}

/**
 * Estimate initial skill score from legacy level text
 * Used for migrating old data
 */
export function estimateScoreFromLegacyLevel(legacyLevel: string): number {
  const lower = legacyLevel.toLowerCase();
  
  // Map old levels to estimated scores
  if (lower === 'novice') return 25;
  if (lower === 'beginner-') return 45;
  if (lower === 'beginner') return 55;
  if (lower === 'beginner+') return 65;
  if (lower === 'intermediate-') return 80;
  if (lower === 'intermediate') return 90;
  if (lower === 'intermediate+') return 100;
  if (lower === 'advanced' || lower === 'advanced-') return 120;
  if (lower === 'advanced+') return 145;
  if (lower === 'professional') return 180;
  
  return 90; // Default to mid-Intermediate
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
