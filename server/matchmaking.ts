import { Player, GameParticipant } from '@shared/schema';

// Tier definitions matching schema (6 tiers, indices 0-5)
// lower_intermediate (70-89) → display "Intermediate"
// upper_intermediate (90-109) → display "Competitive"
const TIER_RANGES = [
  { name: 'Novice',             min: 10,  max: 39,  index: 0 },
  { name: 'Beginner',           min: 40,  max: 69,  index: 1 },
  { name: 'lower_intermediate', min: 70,  max: 89,  index: 2 },
  { name: 'upper_intermediate', min: 90,  max: 109, index: 3 },
  { name: 'Advanced',           min: 110, max: 159, index: 4 },
  { name: 'Professional',       min: 160, max: 200, index: 5 },
];

/**
 * Return the 0-based tier index for a given skill score.
 * 0=Novice, 1=Beginner, 2=Intermediate, 3=Competitive, 4=Advanced, 5=Professional
 */
export function getTierIndex(skillScore: number): number {
  const clamped = Math.max(10, Math.min(200, skillScore));
  for (const tier of TIER_RANGES) {
    if (clamped >= tier.min && clamped <= tier.max) return tier.index;
  }
  return 2;
}

/**
 * Return the 0-based tier index from a confirmed player.level DB value.
 * Used for matchmaking pool selection so the 3-game buffer is respected —
 * players stay at their confirmed tier until promoted, regardless of current score.
 */
export function getConfirmedTierIndex(level: string): number {
  switch (level) {
    case 'Novice':             return 0;
    case 'Beginner':           return 1;
    case 'lower_intermediate': return 2;
    case 'Intermediate':       return 2; // legacy label
    case 'upper_intermediate': return 3;
    case 'Competitive':        return 3; // display-name fallback
    case 'Advanced':           return 4;
    case 'Professional':       return 5;
    default:                   return 2;
  }
}

// Player rest state tracking
interface PlayerRestState {
  playerId: string;
  consecutiveGames: number;
  gamesWaited: number; // games sat out since last playing
  gamesThisSession: number; // total games played this session
  lastGameEndedAt: Date | null;
  needsRest: boolean;
}

// Team combination with balance metrics
export interface TeamCombination {
  team1: Player[];
  team2: Player[];
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  variance: number;
  tierDispersion: number;     // max tier index - min tier index across all 4 players (0 = same tier)
  splitPenalty: number;       // partner repetition penalty (0 = novel pairing, up to 60 = both pairs repeated)
  crossTierPenalty: number;   // 0 = no cross-tier team, 1+ = teams with mixed-tier players (prefer 0)
  withinTeamSpread1: number;  // max-min score spread within team1
  withinTeamSpread2: number;  // max-min score spread within team2
  equityRank: number;         // negated sum of session deficits (lower = more under-served players)
  isStretchMatch?: boolean;   // true if this is a lone-outlier stretch match
  stretchMatchText?: string;  // explanatory text for stretch matches
  outlierGamesWaited?: number;// gamesWaited of the lone outlier in this stretch match
  isCompromised?: boolean;    // true if generated under the relaxed 25pt spread limit
  rank: number;
}

/**
 * Return a user-facing display name for a tier by its index in TIER_RANGES.
 */
function getTierDisplayNameForIndex(tierIndex: number): string {
  const tier = TIER_RANGES[tierIndex];
  if (!tier) return String(tierIndex);
  switch (tier.name) {
    case 'lower_intermediate': return 'Intermediate';
    case 'upper_intermediate': return 'Competitive';
    default: return tier.name;
  }
}

// ─── In-memory state stores ──────────────────────────────────────────────────

// Rest state: sessionId → playerId → PlayerRestState
const sessionRestStates = new Map<string, Map<string, PlayerRestState>>();

// Fix 3: Partner history: sessionId → "lowerId:higherId" → times played together
const sessionPartnerHistory = new Map<string, Map<string, number>>();

// Voluntary sit-out: sessionId → Set of player IDs currently sitting out
const sessionSittingOut = new Map<string, Set<string>>();

// ─── Rest state helpers ───────────────────────────────────────────────────────

function getSessionRestStates(sessionId: string): Map<string, PlayerRestState> {
  if (!sessionRestStates.has(sessionId)) {
    sessionRestStates.set(sessionId, new Map());
  }
  return sessionRestStates.get(sessionId)!;
}

/**
 * Update player rest state after a game ends.
 * Fix 4: Graduated reset — sitting out 1 game halves consecutiveGames instead of zeroing it;
 * only 2+ games out produces a full reset.
 */
export function updatePlayerRestState(
  sessionId: string,
  playerId: string,
  played: boolean
): void {
  const states = getSessionRestStates(sessionId);
  const current = states.get(playerId) || {
    playerId,
    consecutiveGames: 0,
    gamesWaited: 0,
    gamesThisSession: 0,
    lastGameEndedAt: null,
    needsRest: false,
  };
  // Ensure gamesThisSession is present on objects hydrated before this field existed
  if (current.gamesThisSession === undefined) current.gamesThisSession = 0;

  if (played) {
    current.consecutiveGames += 1;
    current.gamesWaited = 0;
    current.gamesThisSession += 1;
    current.lastGameEndedAt = new Date();
    current.needsRest = current.consecutiveGames >= 2;
  } else {
    // Fix 4: graduated reset
    current.gamesWaited += 1;
    if (current.gamesWaited === 1) {
      // First game out: halve the consecutive count (lingering penalty)
      current.consecutiveGames = Math.floor(current.consecutiveGames / 2);
    } else {
      // Two or more games out: full reset
      current.consecutiveGames = 0;
    }
    current.needsRest = current.consecutiveGames >= 2;
    // Auto-clear voluntary sit-out after one game passes
    clearSittingOutPlayer(sessionId, playerId);
  }

  states.set(playerId, current);
}

export function getPlayerRestState(sessionId: string, playerId: string): PlayerRestState {
  const states = getSessionRestStates(sessionId);
  const existing = states.get(playerId);
  if (existing) {
    if (existing.gamesThisSession === undefined) existing.gamesThisSession = 0;
    return existing;
  }
  return {
    playerId,
    consecutiveGames: 0,
    gamesWaited: 0,
    gamesThisSession: 0,
    lastGameEndedAt: null,
    needsRest: false,
  };
}

export function clearPlayerRestState(sessionId: string, playerId: string): void {
  const sessionMap = sessionRestStates.get(sessionId);
  if (sessionMap) {
    sessionMap.delete(playerId);
    if (sessionMap.size === 0) sessionRestStates.delete(sessionId);
  }
}

export function clearSessionRestStates(sessionId: string): void {
  sessionRestStates.delete(sessionId);
  sessionPartnerHistory.delete(sessionId);
  sessionSittingOut.delete(sessionId);
}

// ─── Sit-out helpers ──────────────────────────────────────────────────────────

/**
 * Toggle a player's voluntary sit-out status for the current round.
 * Returns the new state (true = now sitting out, false = no longer sitting out).
 */
export function toggleSittingOut(sessionId: string, playerId: string): boolean {
  if (!sessionSittingOut.has(sessionId)) {
    sessionSittingOut.set(sessionId, new Set());
  }
  const set = sessionSittingOut.get(sessionId)!;
  if (set.has(playerId)) {
    set.delete(playerId);
    return false;
  }
  set.add(playerId);
  return true;
}

/** Returns true if the player is currently voluntarily sitting out. */
export function isSittingOut(sessionId: string, playerId: string): boolean {
  return sessionSittingOut.get(sessionId)?.has(playerId) ?? false;
}

/** Returns all player IDs currently sitting out in this session. */
export function getSittingOutPlayers(sessionId: string): string[] {
  return Array.from(sessionSittingOut.get(sessionId) ?? []);
}

/** Clears a single player's sit-out flag (auto-clear or on queue removal). */
export function clearSittingOutPlayer(sessionId: string, playerId: string): void {
  sessionSittingOut.get(sessionId)?.delete(playerId);
}

/**
 * Build rest states from game history (idempotent).
 * Fix 4: Replays the same graduated-reset logic used in updatePlayerRestState.
 */
export function buildRestStatesFromHistory(
  sessionId: string,
  gameParticipants: (GameParticipant & { createdAt: Date })[],
  allPlayerIds: string[]
): void {
  const sortedGames = [...gameParticipants].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const gameGroups = new Map<string, (GameParticipant & { createdAt: Date })[]>();
  for (const participant of sortedGames) {
    if (!gameGroups.has(participant.gameId)) gameGroups.set(participant.gameId, []);
    gameGroups.get(participant.gameId)!.push(participant);
  }

  const orderedGameIds = Array.from(new Set(sortedGames.map(p => p.gameId)));

  // RESET all player states before replaying — ensures idempotency on repeated calls
  const states = getSessionRestStates(sessionId);
  for (const playerId of allPlayerIds) {
    states.set(playerId, {
      playerId,
      consecutiveGames: 0,
      gamesWaited: 0,
      gamesThisSession: 0,
      lastGameEndedAt: null,
      needsRest: false,
    });
  }

  for (const gameId of orderedGameIds) {
    const participants = gameGroups.get(gameId) || [];
    const playerIdsInGame = new Set(participants.map(p => p.playerId));

    for (const playerId of allPlayerIds) {
      const current = states.get(playerId)!;

      if (playerIdsInGame.has(playerId)) {
        current.consecutiveGames += 1;
        current.gamesWaited = 0;
        current.gamesThisSession += 1;
        current.lastGameEndedAt = participants[0].createdAt;
      } else {
        // Fix 4: graduated reset (same logic as updatePlayerRestState)
        current.gamesWaited += 1;
        if (current.gamesWaited === 1) {
          current.consecutiveGames = Math.floor(current.consecutiveGames / 2);
        } else {
          current.consecutiveGames = 0;
        }
      }

      current.needsRest = current.consecutiveGames >= 2;
      states.set(playerId, current);
    }
  }
}

// ─── Fix 3: Partner history helpers ──────────────────────────────────────────

function partnerKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function getSessionPartnerHistory(sessionId: string): Map<string, number> {
  if (!sessionPartnerHistory.has(sessionId)) {
    sessionPartnerHistory.set(sessionId, new Map());
  }
  return sessionPartnerHistory.get(sessionId)!;
}

/**
 * Record the two pairs who played together after a game ends.
 * Called from the game-end handler in routes.ts.
 */
export function updatePartnerHistory(
  sessionId: string,
  team1: Player[],
  team2: Player[]
): void {
  const history = getSessionPartnerHistory(sessionId);
  if (team1.length >= 2) {
    const key = partnerKey(team1[0].id, team1[1].id);
    history.set(key, (history.get(key) ?? 0) + 1);
  }
  if (team2.length >= 2) {
    const key = partnerKey(team2[0].id, team2[1].id);
    history.set(key, (history.get(key) ?? 0) + 1);
  }
}

/**
 * Rebuild partner history from game history on server restart (idempotent).
 * Called alongside buildRestStatesFromHistory in the session resume/hydration path.
 */
export function buildPartnerHistoryFromHistory(
  sessionId: string,
  gameParticipants: (GameParticipant & { createdAt: Date })[]
): void {
  const history = new Map<string, number>();

  const gameGroups = new Map<string, typeof gameParticipants>();
  for (const p of gameParticipants) {
    if (!gameGroups.has(p.gameId)) gameGroups.set(p.gameId, []);
    gameGroups.get(p.gameId)!.push(p);
  }

  for (const participants of gameGroups.values()) {
    const team1Ids = participants.filter(p => p.team === 1).map(p => p.playerId);
    const team2Ids = participants.filter(p => p.team === 2).map(p => p.playerId);

    if (team1Ids.length >= 2) {
      const key = partnerKey(team1Ids[0], team1Ids[1]);
      history.set(key, (history.get(key) ?? 0) + 1);
    }
    if (team2Ids.length >= 2) {
      const key = partnerKey(team2Ids[0], team2Ids[1]);
      history.set(key, (history.get(key) ?? 0) + 1);
    }
  }

  sessionPartnerHistory.set(sessionId, history);
}

/**
 * Calculate split penalty for a proposed pairing.
 * +15 per repeated pair, capped at 30 per pair, max 60 total.
 */
function calculateSplitPenalty(
  team1: Player[],
  team2: Player[],
  sessionId: string
): number {
  const history = getSessionPartnerHistory(sessionId);
  let total = 0;

  if (team1.length >= 2) {
    const times = history.get(partnerKey(team1[0].id, team1[1].id)) ?? 0;
    total += Math.min(30, times * 15);
  }
  if (team2.length >= 2) {
    const times = history.get(partnerKey(team2[0].id, team2[1].id)) ?? 0;
    total += Math.min(30, times * 15);
  }

  return Math.min(60, total);
}

// ─── Fix 5: Dynamic window sizing ────────────────────────────────────────────

/**
 * Calculate candidate window sizes based on the live queue length.
 * Auto-assign: 35% of queue length, clamped to [6, 16].
 * Suggestions:  50% of queue length, clamped to [8, 24].
 *
 * Examples: 8 players → 6/8, 28 players → 9/14, 40 players → 14/20.
 */
export function getWindowSizes(queueLength: number): { autoWindow: number; suggestWindow: number } {
  const autoWindow   = Math.max(6, Math.min(16, Math.floor(queueLength * 0.35)));
  const suggestWindow = Math.max(8, Math.min(24, Math.floor(queueLength * 0.50)));
  return { autoWindow, suggestWindow };
}

// ─── Team permutations & balance metrics ─────────────────────────────────────

function getAllTeamPermutations(players: Player[]): [Player[], Player[]][] {
  if (players.length !== 4) return [];
  const [p0, p1, p2, p3] = players;
  return [
    [[p0, p1], [p2, p3]],
    [[p0, p2], [p1, p3]],
    [[p0, p3], [p1, p2]],
  ];
}

function calculateTeamMetrics(team1: Player[], team2: Player[]): {
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  variance: number;
  tierDispersion: number;
  crossTierPenalty: number;
  withinTeamSpread1: number;
  withinTeamSpread2: number;
} {
  const team1Skills = team1.map(p => p.skillScore || 90);
  const team2Skills = team2.map(p => p.skillScore || 90);

  const team1Avg = team1Skills.reduce((a, b) => a + b, 0) / team1Skills.length;
  const team2Avg = team2Skills.reduce((a, b) => a + b, 0) / team2Skills.length;
  const skillGap = Math.abs(team1Avg - team2Avg);

  const withinTeamSpread1 = team1Skills.length > 1 ? Math.max(...team1Skills) - Math.min(...team1Skills) : 0;
  const withinTeamSpread2 = team2Skills.length > 1 ? Math.max(...team2Skills) - Math.min(...team2Skills) : 0;

  const allSkills = [...team1Skills, ...team2Skills];
  const mean = (team1Avg + team2Avg) / 2;
  const variance = allSkills.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allSkills.length;

  const team1Tiers = team1.map(p => getConfirmedTierIndex(p.level || 'lower_intermediate'));
  const team2Tiers = team2.map(p => getConfirmedTierIndex(p.level || 'lower_intermediate'));
  const allTierIndices = [...team1Tiers, ...team2Tiers];
  const tierDispersion = Math.max(...allTierIndices) - Math.min(...allTierIndices);

  // Find the plurality (majority) confirmed tier among all 4 players.
  // Cross-tier players are those NOT in the majority tier.
  // Penalty when 2+ cross-tier players end up on the same team — they should be split.
  const tierCounts = new Map<number, number>();
  for (const t of allTierIndices) tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1);
  const majorityTier = [...tierCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const team1CrossTier = team1Tiers.filter(t => t !== majorityTier).length;
  const team2CrossTier = team2Tiers.filter(t => t !== majorityTier).length;
  // Penalty for any team that has 2+ cross-tier players stacked together
  const crossTierPenalty = (team1CrossTier > 1 ? 1 : 0) + (team2CrossTier > 1 ? 1 : 0);

  return { team1Avg, team2Avg, skillGap, variance, tierDispersion, crossTierPenalty, withinTeamSpread1, withinTeamSpread2 };
}

/**
 * Find the best balanced team combinations from a set of 4 players.
 * Sort order: tierDispersion → skillGap → splitPenalty (tie-break) → variance.
 * Fix 3: splitPenalty breaks near-equal skill-gap ties, never overrides balance.
 */
export function findBalancedTeams(
  players: Player[],
  topN: number = 5,
  groupByTier: boolean = false,
  sessionId?: string
): TeamCombination[] {
  if (players.length !== 4) {
    throw new Error('Exactly 4 players required for team assignment');
  }

  const permutations = getAllTeamPermutations(players);
  const combinations: TeamCombination[] = [];

  for (const [team1, team2] of permutations) {
    const metrics = calculateTeamMetrics(team1, team2);
    const splitPenalty = sessionId ? calculateSplitPenalty(team1, team2, sessionId) : 0;
    combinations.push({ team1, team2, ...metrics, splitPenalty, equityRank: 0, rank: 0 });
  }

  // Hard constraint: exclude permutations that put 2 cross-tier players on the same team,
  // but only when at least one permutation doesn't have this problem.
  const validArrangements = combinations.filter(c => c.crossTierPenalty === 0);
  const workingSet = validArrangements.length > 0 ? validArrangements : combinations;

  workingSet.sort((a, b) => {
    if (groupByTier) {
      const tierDiff = a.tierDispersion - b.tierDispersion;
      if (tierDiff !== 0) return tierDiff;
    }
    // Primary: skill gap
    if (Math.abs(a.skillGap - b.skillGap) >= 0.01) return a.skillGap - b.skillGap;
    // Tie-break: split penalty (partner repetition)
    const penaltyDiff = a.splitPenalty - b.splitPenalty;
    if (penaltyDiff !== 0) return penaltyDiff;
    // Final tie-break: within-team variance
    return a.variance - b.variance;
  });

  workingSet.forEach((combo, index) => { combo.rank = index + 1; });
  return workingSet.slice(0, topN);
}

// ─── Player priority & selection ─────────────────────────────────────────────

export function filterEligiblePlayers(
  sessionId: string,
  playerIds: string[],
  allPlayers: Player[]
): { eligible: Player[]; needingRest: Player[] } {
  const eligible: Player[] = [];
  const needingRest: Player[] = [];

  for (const playerId of playerIds) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) continue;
    if (getPlayerRestState(sessionId, playerId).needsRest) {
      needingRest.push(player);
    } else {
      eligible.push(player);
    }
  }

  return { eligible, needingRest };
}

function calculatePlayerPriority(
  player: Player,
  queuePosition: number,
  restState: PlayerRestState,
  sessionAvgGames: number = 0,
  queueWeight: number = 25.0,
  restWeight: number = 10.0,
  gamesPlayedWeight: number = 0.1,
  waitingBonusWeight: number = 6.0,
  sessionEquityWeight: number = 40.0
): number {
  const positionScore = queuePosition * queueWeight;
  const restPenalty = restState.needsRest ? restState.consecutiveGames * restWeight : 0;
  const gamesPlayedPenalty = (player.gamesPlayed || 0) * gamesPlayedWeight;
  const waitingBonus = restState.gamesWaited * waitingBonusWeight;
  const sessionDeficit = sessionAvgGames - (restState.gamesThisSession || 0);
  const sessionEquityBonus = sessionDeficit * sessionEquityWeight;
  return positionScore + restPenalty + gamesPlayedPenalty - waitingBonus - sessionEquityBonus;
}

/** Within-team spread check: returns true if both teams satisfy the spread limit. */
function isValidSplit(team1: Player[], team2: Player[], maxSpread: number): boolean {
  const t1 = team1.map(p => p.skillScore || 90);
  const t2 = team2.map(p => p.skillScore || 90);
  return (Math.max(...t1) - Math.min(...t1)) <= maxSpread &&
         (Math.max(...t2) - Math.min(...t2)) <= maxSpread;
}

/**
 * Select the best 4 players for auto-assign.
 * Fix 5: windowSize defaults to the dynamic autoWindow (35% of queue, clamped 6–16).
 */
export function selectOptimalPlayers(
  sessionId: string,
  queuePlayerIds: string[],
  allPlayers: Player[],
  windowSize?: number,
  groupByTier: boolean = false
): {
  selectedPlayers: Player[];
  restWarnings: string[];
  isMixedTier: boolean;
} {
  const restWarnings: string[] = [];

  // Fix 5: use dynamic window if not explicitly specified
  const { autoWindow } = getWindowSizes(queuePlayerIds.length);
  const effectiveWindow = windowSize ?? autoWindow;
  // Exclude sitting-out players from the candidate pool (they keep their queue position)
  const eligibleIds = queuePlayerIds.filter(id => !isSittingOut(sessionId, id));
  const candidateIds = eligibleIds.slice(0, Math.min(effectiveWindow, eligibleIds.length));

  const scoredCandidates = candidateIds.map((playerId, index) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return null;
    const restState = getPlayerRestState(sessionId, playerId);
    // Auto-assign path: use queue ×25, wait ×6; no session equity term (sessionAvgGames not available here)
    const priority = calculatePlayerPriority(player, index, restState, 0, 25.0, 10.0, 0.1, 6.0, 0);
    // Use confirmed tier (player.level) — respects the 3-game promotion buffer.
    const tierIndex = getConfirmedTierIndex(player.level || 'lower_intermediate');
    return { player, priority, restState, queuePosition: index, tierIndex };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  scoredCandidates.sort((a, b) => a.priority - b.priority);

  let selected = scoredCandidates.slice(0, 4);
  let isMixedTier = false;
  let tierGroupFound = false;

  if (groupByTier && scoredCandidates.length >= 4) {
    const leadTier = scoredCandidates[0].tierIndex;
    const sameTier = scoredCandidates.filter(c => c.tierIndex === leadTier);

    if (sameTier.length >= 4) {
      // Pure same-tier match
      selected = sameTier.slice(0, 4);
      isMixedTier = false;
      tierGroupFound = true;
    } else if (sameTier.length >= 3) {
      // 3 same-tier + exactly 1 adjacent-tier player allowed
      const adjacent = scoredCandidates.filter(
        c => c.tierIndex !== leadTier && Math.abs(c.tierIndex - leadTier) === 1
      );
      if (adjacent.length >= 1) {
        selected = [...sameTier.slice(0, 3), adjacent[0]];
        isMixedTier = true;
        tierGroupFound = true;
        const t1 = getTierDisplayNameForIndex(leadTier);
        const t2 = getTierDisplayNameForIndex(adjacent[0].tierIndex);
        const warning = `Mixed levels: ${t1} + ${t2}`;
        restWarnings.push(warning);
        console.warn(`[Matchmaking] ${warning} — 3+1 adjacent-tier match`);
      }
    }

    if (!tierGroupFound) {
      // When groupByTier is active and fewer than 3 same-tier players exist,
      // we CANNOT form a valid group — return empty to signal the caller.
      // No unconstrained fallback: the caller must treat <4 selected players as
      // "insufficient tier-compatible players" and surface that to the user.
      console.warn('[Matchmaking] Insufficient same-tier candidates; cannot form a valid tier group');
      restWarnings.push('Insufficient same-tier players; cannot form a tier-grouped match');
      selected = [];
    }
  } else {
    const tiers = selected.map(c => c.tierIndex);
    isMixedTier = selected.length >= 4 && Math.max(...tiers) - Math.min(...tiers) > 0;
  }

  const selectedPlayers = selected.map(c => c.player);

  for (const candidate of selected) {
    if (candidate.restState.needsRest) {
      restWarnings.push(
        `${candidate.player.name} has played ${candidate.restState.consecutiveGames} consecutive games`
      );
    }
  }

  return { selectedPlayers, restWarnings, isMixedTier };
}

/**
 * Generate multiple sets of 4 players and their team combinations for the suggestions UI.
 * Fix 3: passes sessionId to findBalancedTeams() so split penalty influences ranking.
 * Fix 5: candidate window is 50% of queue length, clamped to [8, 24].
 */
export function generateAllMatchupOptions(
  sessionId: string,
  queuePlayerIds: string[],
  allPlayers: Player[],
  maxOptions: number = 5,
  groupByTier: boolean = false
): {
  allCombinations: TeamCombination[];
  restWarnings: string[];
  loneOutliers: { player: Player; gamesWaited: number }[];
  stretchMatches: TeamCombination[];
} {
  const restWarnings: string[] = [];

  // Dynamic suggest window; exclude sitting-out players
  const eligibleQueueIds = queuePlayerIds.filter(id => !isSittingOut(sessionId, id));
  const { suggestWindow } = getWindowSizes(eligibleQueueIds.length);
  const candidateIds = eligibleQueueIds.slice(0, suggestWindow);

  // ─── Build scored candidate pool ──────────────────────────────────────────
  let totalGamesThisSession = 0;
  let eligibleCount = 0;

  const baseCandidates = candidateIds.map((playerId, index) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return null;
    const restState = getPlayerRestState(sessionId, playerId);
    totalGamesThisSession += restState.gamesThisSession;
    eligibleCount++;
    const tierIndex = getConfirmedTierIndex(player.level || 'lower_intermediate');
    return { player, restState, queuePosition: index, tierIndex };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  const sessionAvgGames = eligibleCount > 0 ? totalGamesThisSession / eligibleCount : 0;

  // Score with new weights: queue ×25, wait ×6, session deficit ×40
  const scored = baseCandidates.map(c => ({
    ...c,
    priority: calculatePlayerPriority(c.player, c.queuePosition, c.restState, sessionAvgGames),
  }));
  scored.sort((a, b) => a.priority - b.priority);

  // ─── Lone outlier detection ───────────────────────────────────────────────
  // A lone outlier is the ONLY player of their confirmed tier in the candidate pool.
  const tierCountMap = new Map<number, typeof scored>();
  for (const c of scored) {
    if (!tierCountMap.has(c.tierIndex)) tierCountMap.set(c.tierIndex, []);
    tierCountMap.get(c.tierIndex)!.push(c);
  }

  const loneOutlierCandidates = scored.filter(c => (tierCountMap.get(c.tierIndex)?.length ?? 0) === 1);
  const loneOutlierIds = new Set(loneOutlierCandidates.map(c => c.player.id));

  const loneOutliers = loneOutlierCandidates.map(c => ({
    player: c.player,
    gamesWaited: c.restState.gamesWaited,
  }));

  // Regular candidates exclude lone outliers
  const regularCandidates = scored.filter(c => !loneOutlierIds.has(c.player.id));

  // ─── Helper: enrich player with session state ─────────────────────────────
  const enrichPlayer = (p: Player, rs: PlayerRestState): Player => ({
    ...p,
    gamesWaited: rs.gamesWaited,
    gamesThisSession: rs.gamesThisSession,
  } as Player);

  // ─── Helper: generate player groups of 4 ────────────────────────────────
  const generatePlayerSets = (candidates: typeof scored): Player[][] => {
    const sets: Player[][] = [];
    const n = candidates.length;
    if (n < 4) return [];
    const limit = Math.min(n, 10);

    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        for (let k = j + 1; k < limit; k++) {
          for (let l = k + 1; l < limit; l++) {
            const group = [candidates[i], candidates[j], candidates[k], candidates[l]];

            if (groupByTier) {
              // Hard tier-composition constraint: 4 same-tier OR 3+1 adjacent
              const tierCounts = new Map<number, number>();
              for (const c of group) tierCounts.set(c.tierIndex, (tierCounts.get(c.tierIndex) ?? 0) + 1);
              const sorted2 = [...tierCounts.entries()].sort((a, b) => b[1] - a[1]);
              const majorityTier = sorted2[0][0];
              const majorityCount = sorted2[0][1];
              if (majorityCount < 3) continue;
              const cross = group.filter(c => c.tierIndex !== majorityTier);
              if (!cross.every(c => Math.abs(c.tierIndex - majorityTier) === 1)) continue;
              if (cross.length > 1) continue;
            }

            sets.push(group.map(c => c.player));
            if (sets.length >= 20) return sets;
          }
        }
      }
    }
    return sets;
  };

  // ─── Helper: compute equity rank for a group of 4 ────────────────────────
  const getEquityRank = (team1: Player[], team2: Player[]): number => {
    // Negative sum of deficits → lower value = more under-served players (sort asc to prefer them)
    const totalDeficit = [...team1, ...team2].reduce((sum, p) => {
      const rs = scored.find(c => c.player.id === p.id)?.restState;
      return sum + (sessionAvgGames - (rs?.gamesThisSession ?? 0));
    }, 0);
    return -totalDeficit; // negate: more deficit = lower equityRank = preferred
  };

  // ─── Helper: build combos from player sets with spread filter ─────────────
  const buildCombinations = (playerSets: Player[][], maxSpread: number, isCompromised: boolean): TeamCombination[] => {
    const combos: TeamCombination[] = [];
    const processed = new Set<string>();

    for (const playerSet of playerSets) {
      const setKey = playerSet.map(p => p.id).sort().join('-');
      if (processed.has(setKey)) continue;
      processed.add(setKey);

      const permutations = getAllTeamPermutations(playerSet);
      let best: TeamCombination | null = null;

      for (const [t1, t2] of permutations) {
        if (!isValidSplit(t1, t2, maxSpread)) continue;

        const metrics = calculateTeamMetrics(t1, t2);
        const splitPenalty = calculateSplitPenalty(t1, t2, sessionId);
        const equityRank = getEquityRank(t1, t2);

        const combo: TeamCombination = {
          team1: t1,
          team2: t2,
          ...metrics,
          splitPenalty,
          equityRank,
          isCompromised,
          isStretchMatch: false,
          rank: 0,
        };

        if (!best) {
          best = combo;
        } else {
          // 5-factor: tierDispersion → skillGap → equityRank → splitPenalty → variance
          const beats =
            combo.tierDispersion < best.tierDispersion ||
            (combo.tierDispersion === best.tierDispersion && combo.skillGap < best.skillGap - 0.01) ||
            (combo.tierDispersion === best.tierDispersion && Math.abs(combo.skillGap - best.skillGap) < 0.01 && combo.equityRank < best.equityRank) ||
            (combo.tierDispersion === best.tierDispersion && Math.abs(combo.skillGap - best.skillGap) < 0.01 && combo.equityRank === best.equityRank && combo.splitPenalty < best.splitPenalty) ||
            (combo.tierDispersion === best.tierDispersion && Math.abs(combo.skillGap - best.skillGap) < 0.01 && combo.equityRank === best.equityRank && combo.splitPenalty === best.splitPenalty && combo.variance < best.variance);
          if (beats) best = combo;
        }
      }

      if (best) {
        // Rest warnings
        for (const player of playerSet) {
          const rs = getPlayerRestState(sessionId, player.id);
          if (rs.needsRest) {
            const msg = `${player.name} has played ${rs.consecutiveGames} consecutive games`;
            if (!restWarnings.includes(msg)) restWarnings.push(msg);
          }
        }
        combos.push(best);
      }
    }

    return combos;
  };

  // ─── Generate regular suggestions ────────────────────────────────────────
  const playerSets = generatePlayerSets(regularCandidates);

  if (groupByTier && playerSets.length === 0 && regularCandidates.length >= 4) {
    console.warn('[Matchmaking] No valid tier-grouped sets found in candidate window; cannot suggest');
    restWarnings.push('Insufficient same-tier players; cannot generate tier-grouped suggestions');
  }

  let combinations = buildCombinations(playerSets, 20, false);

  // Last resort: retry at 25pt spread if no clean options exist
  if (combinations.length === 0 && playerSets.length > 0) {
    combinations = buildCombinations(playerSets, 25, true);
    if (combinations.length > 0) {
      console.warn('[Matchmaking] Using compromised spread limit (25pts)');
    }
  }

  // 5-factor final sort
  combinations.sort((a, b) => {
    const tierDiff = a.tierDispersion - b.tierDispersion;
    if (tierDiff !== 0) return tierDiff;
    if (Math.abs(a.skillGap - b.skillGap) >= 0.01) return a.skillGap - b.skillGap;
    const eqDiff = a.equityRank - b.equityRank;
    if (eqDiff !== 0) return eqDiff;
    const penDiff = a.splitPenalty - b.splitPenalty;
    if (penDiff !== 0) return penDiff;
    return a.variance - b.variance;
  });

  // ─── Build Stretch Matches ─────────────────────────────────────────────────
  // Deterministic algorithm per spec:
  //   1. For each lone outlier with gamesWaited ≥ 2, evaluate both adjacent tiers.
  //   2. For each adjacent tier that has ≥ 3 players:
  //      a. Sort by skill score descending.
  //      b. Generate all 3 possible team splits: each of the 3 adjacent players
  //         can be the outlier's partner (the other 2 become opponents).
  //         Split 1: Outlier+A1 vs A2+A3
  //         Split 2: Outlier+A2 vs A1+A3
  //         Split 3: Outlier+A3 vs A1+A2  (often closest game — previously ignored)
  //      c. Validate each split against the 40pt spread limit.
  //      d. Among all valid splits across both adjacent tiers, pick the best by
  //         the 5-factor objective (tierDispersion → skillGap → spreadSum →
  //         splitPenalty → variance). Skill gap is factor 2, so the closest game wins.
  const stretchMatches: TeamCombination[] = [];
  const STRETCH_SPREAD = 40;

  for (const outlierCand of loneOutlierCandidates) {
    if (outlierCand.restState.gamesWaited < 2) continue;

    const outlierTier = outlierCand.tierIndex;
    const outlierPlayer = outlierCand.player;
    const outlierScore = outlierPlayer.skillScore || 90;

    const adjacentTierNums = [outlierTier - 1, outlierTier + 1].filter(t => t >= 0 && t <= 5);

    let bestStretch: TeamCombination | null = null;

    for (const adjTier of adjacentTierNums) {
      // Get players from this specific adjacent tier, sorted by skill desc
      const adjPool = (tierCountMap.get(adjTier) ?? [])
        .filter(c => !loneOutlierIds.has(c.player.id))
        .sort((a, b) => (b.player.skillScore || 90) - (a.player.skillScore || 90));

      if (adjPool.length < 3) continue;

      // Generate all 3 possible team splits: each adjacent player can be the outlier's partner.
      // Split i: outlier + adjPool[i] vs the other two players.
      for (let i = 0; i < 3; i++) {
        const partnerCand = adjPool[i];
        const opps = [adjPool[0], adjPool[1], adjPool[2]].filter((_, idx) => idx !== i);
        const opp1Cand = opps[0];
        const opp2Cand = opps[1];

        // Validate spread on both teams against the 40pt limit
        if (!isValidSplit(
          [outlierPlayer, partnerCand.player],
          [opp1Cand.player, opp2Cand.player],
          STRETCH_SPREAD
        )) continue;

        const metrics = calculateTeamMetrics(
          [outlierPlayer, partnerCand.player],
          [opp1Cand.player, opp2Cand.player]
        );
        const splitPenalty = calculateSplitPenalty(
          [outlierPlayer, partnerCand.player],
          [opp1Cand.player, opp2Cand.player],
          sessionId
        );
        const equityRank = getEquityRank(
          [outlierPlayer, partnerCand.player],
          [opp1Cand.player, opp2Cand.player]
        );

        const candidate: TeamCombination = {
          team1: [outlierPlayer, partnerCand.player],
          team2: [opp1Cand.player, opp2Cand.player],
          ...metrics,
          splitPenalty,
          equityRank,
          isStretchMatch: true,
          stretchMatchText: 'No same-tier partner available. This is the closest competitive match possible.',
          outlierGamesWaited: outlierCand.restState.gamesWaited,
          isCompromised: false,
          rank: 0,
        };

        // Among all valid splits (across both adjacent tiers), pick best by 5-factor objective
        if (!bestStretch) {
          bestStretch = candidate;
        } else {
          const spreadSum = (c: TeamCombination) => c.withinTeamSpread1 + c.withinTeamSpread2;
          const beats =
            candidate.tierDispersion < bestStretch.tierDispersion ||
            (candidate.tierDispersion === bestStretch.tierDispersion && candidate.skillGap < bestStretch.skillGap - 0.01) ||
            (candidate.tierDispersion === bestStretch.tierDispersion && Math.abs(candidate.skillGap - bestStretch.skillGap) < 0.01 && spreadSum(candidate) < spreadSum(bestStretch)) ||
            (candidate.tierDispersion === bestStretch.tierDispersion && Math.abs(candidate.skillGap - bestStretch.skillGap) < 0.01 && spreadSum(candidate) === spreadSum(bestStretch) && candidate.splitPenalty < bestStretch.splitPenalty) ||
            (candidate.tierDispersion === bestStretch.tierDispersion && Math.abs(candidate.skillGap - bestStretch.skillGap) < 0.01 && spreadSum(candidate) === spreadSum(bestStretch) && candidate.splitPenalty === bestStretch.splitPenalty && candidate.variance < bestStretch.variance);
          if (beats) bestStretch = candidate;
        }
      }
    }

    if (!bestStretch) continue;

    // Enrich player objects with session state
    const getRestState = (p: Player) => scored.find(c => c.player.id === p.id)?.restState ?? outlierCand.restState;
    bestStretch.team1 = bestStretch.team1.map(p => enrichPlayer(p, getRestState(p))) as Player[];
    bestStretch.team2 = bestStretch.team2.map(p => enrichPlayer(p, getRestState(p))) as Player[];

    stretchMatches.push(bestStretch);
  }

  // ─── Enrich regular combination player objects with session state ──────────
  for (const combo of combinations) {
    for (const team of [combo.team1, combo.team2]) {
      for (let i = 0; i < team.length; i++) {
        const rs = scored.find(c => c.player.id === team[i].id)?.restState;
        if (rs) team[i] = enrichPlayer(team[i], rs);
      }
    }
  }

  combinations.forEach((combo, index) => { combo.rank = index + 1; });

  return {
    allCombinations: combinations.slice(0, maxOptions),
    restWarnings,
    loneOutliers,
    stretchMatches,
  };
}
