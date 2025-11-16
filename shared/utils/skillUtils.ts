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
 * Calculate skill score adjustment based on game outcome
 * 
 * Uses ELO-style rating system:
 * - Win against higher-skilled opponent: +8 to +15 points
 * - Win against equal opponent: +5 points
 * - Win against lower-skilled opponent: +2 to +4 points
 * - Loss: Inverse point changes
 * 
 * @param playerScore Current player skill score
 * @param opponentAvgScore Average skill score of opposing team
 * @param won Whether the player won the game
 * @param pointDifferential Absolute difference in game score (optional, for fine-tuning)
 * @returns New skill score (bounded between 10-200)
 */
export function calculateSkillAdjustment(
  playerScore: number,
  opponentAvgScore: number,
  won: boolean,
  pointDifferential: number = 0
): number {
  const skillDiff = opponentAvgScore - playerScore;
  let adjustment = 0;

  if (won) {
    // Win scenarios
    if (skillDiff > 20) {
      // Beat much stronger opponent
      adjustment = 15;
    } else if (skillDiff > 10) {
      // Beat stronger opponent
      adjustment = 10;
    } else if (skillDiff > 0) {
      // Beat slightly stronger opponent
      adjustment = 8;
    } else if (skillDiff > -10) {
      // Beat equal opponent
      adjustment = 5;
    } else if (skillDiff > -20) {
      // Beat slightly weaker opponent
      adjustment = 4;
    } else {
      // Beat much weaker opponent
      adjustment = 2;
    }
    
    // Bonus for dominant victory (point differential > 10)
    if (pointDifferential > 10) {
      adjustment += 2;
    }
  } else {
    // Loss scenarios (inverse of wins)
    if (skillDiff > 20) {
      // Lost to much stronger opponent (expected)
      adjustment = -2;
    } else if (skillDiff > 10) {
      // Lost to stronger opponent
      adjustment = -4;
    } else if (skillDiff > 0) {
      // Lost to slightly stronger opponent
      adjustment = -5;
    } else if (skillDiff > -10) {
      // Lost to equal opponent
      adjustment = -8;
    } else if (skillDiff > -20) {
      // Lost to slightly weaker opponent
      adjustment = -10;
    } else {
      // Lost to much weaker opponent (upset)
      adjustment = -15;
    }
    
    // Extra penalty for being dominated (point differential > 10)
    if (pointDifferential > 10) {
      adjustment -= 2;
    }
  }

  // Apply adjustment and bound between min/max
  const newScore = playerScore + adjustment;
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
