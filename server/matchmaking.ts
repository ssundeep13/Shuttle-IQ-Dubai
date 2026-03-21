import { Player, GameParticipant } from '@shared/schema';

// Tier definitions matching schema comments
const TIER_RANGES = [
  { name: 'Novice',       min: 10,  max: 39,  index: 0 },
  { name: 'Beginner',     min: 40,  max: 69,  index: 1 },
  { name: 'Intermediate', min: 70,  max: 109, index: 2 },
  { name: 'Advanced',     min: 110, max: 159, index: 3 },
  { name: 'Professional', min: 160, max: 200, index: 4 },
];

/**
 * Return the 0-based tier index for a given skill score.
 * 0 = Novice, 1 = Beginner, 2 = Intermediate, 3 = Advanced, 4 = Professional
 */
export function getTierIndex(skillScore: number): number {
  const clamped = Math.max(10, Math.min(200, skillScore));
  for (const tier of TIER_RANGES) {
    if (clamped >= tier.min && clamped <= tier.max) return tier.index;
  }
  return 2;
}

// Player rest state tracking
interface PlayerRestState {
  playerId: string;
  consecutiveGames: number;
  gamesWaited: number; // games sat out since last playing
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
  tierDispersion: number; // max tier index - min tier index across all 4 players (0 = same tier)
  splitPenalty: number;   // Fix 3: partner repetition penalty (0 = novel pairing, up to 60 = both pairs repeated)
  rank: number;
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
    lastGameEndedAt: null,
    needsRest: false,
  };

  if (played) {
    current.consecutiveGames += 1;
    current.gamesWaited = 0;
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
  return states.get(playerId) || {
    playerId,
    consecutiveGames: 0,
    gamesWaited: 0,
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
} {
  const team1Skills = team1.map(p => p.skillScore || 90);
  const team2Skills = team2.map(p => p.skillScore || 90);

  const team1Avg = team1Skills.reduce((a, b) => a + b, 0) / team1Skills.length;
  const team2Avg = team2Skills.reduce((a, b) => a + b, 0) / team2Skills.length;
  const skillGap = Math.abs(team1Avg - team2Avg);

  const allSkills = [...team1Skills, ...team2Skills];
  const mean = (team1Avg + team2Avg) / 2;
  const variance = allSkills.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allSkills.length;

  const allTierIndices = allSkills.map(s => getTierIndex(s));
  const tierDispersion = Math.max(...allTierIndices) - Math.min(...allTierIndices);

  return { team1Avg, team2Avg, skillGap, variance, tierDispersion };
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
    combinations.push({ team1, team2, ...metrics, splitPenalty, rank: 0 });
  }

  combinations.sort((a, b) => {
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

  combinations.forEach((combo, index) => { combo.rank = index + 1; });
  return combinations.slice(0, topN);
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
  queueWeight: number = 100.0,
  restWeight: number = 10.0,
  gamesPlayedWeight: number = 0.1,
  waitingBonusWeight: number = 18.0
): number {
  const positionScore = queuePosition * queueWeight;
  const restPenalty = restState.needsRest ? restState.consecutiveGames * restWeight : 0;
  const gamesPlayedPenalty = (player.gamesPlayed || 0) * gamesPlayedWeight;
  const waitingBonus = restState.gamesWaited * waitingBonusWeight;
  return positionScore + restPenalty + gamesPlayedPenalty - waitingBonus;
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
    const priority = calculatePlayerPriority(player, index, restState);
    const tierIndex = getTierIndex(player.skillScore || 90);
    return { player, priority, restState, queuePosition: index, tierIndex };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  scoredCandidates.sort((a, b) => a.priority - b.priority);

  let selected = scoredCandidates.slice(0, 4);
  let isMixedTier = false;
  let tierGroupFound = false;

  if (groupByTier && scoredCandidates.length >= 4) {
    const leadTier = scoredCandidates[0].tierIndex;

    for (const tierTolerance of [0, 1]) {
      const tierCandidates = scoredCandidates.filter(
        c => Math.abs(c.tierIndex - leadTier) <= tierTolerance
      );
      if (tierCandidates.length >= 4) {
        selected = tierCandidates.slice(0, 4);
        const tiers = selected.map(c => c.tierIndex);
        isMixedTier = Math.max(...tiers) - Math.min(...tiers) > 0;
        tierGroupFound = true;
        break;
      }
    }

    if (!tierGroupFound) {
      const tiers = selected.map(c => c.tierIndex);
      isMixedTier = Math.max(...tiers) - Math.min(...tiers) > 0;
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
  maxOptions: number = 15,
  groupByTier: boolean = false
): {
  allCombinations: TeamCombination[];
  restWarnings: string[];
} {
  const restWarnings: string[] = [];
  const allCombinations: TeamCombination[] = [];
  const processedPlayerSets = new Set<string>();

  // Fix 5: dynamic suggest window; exclude sitting-out players
  const eligibleQueueIds = queuePlayerIds.filter(id => !isSittingOut(sessionId, id));
  const { suggestWindow } = getWindowSizes(eligibleQueueIds.length);
  const candidateIds = eligibleQueueIds.slice(0, suggestWindow);

  const scoredCandidates = candidateIds.map((playerId, index) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return null;
    const restState = getPlayerRestState(sessionId, playerId);
    const priority = calculatePlayerPriority(player, index, restState);
    const tierIndex = getTierIndex(player.skillScore || 90);
    return { player, priority, restState, queuePosition: index, tierIndex };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  scoredCandidates.sort((a, b) => a.priority - b.priority);

  const generatePlayerSets = (): Player[][] => {
    const sets: Player[][] = [];
    const minPlayers = Math.min(8, scoredCandidates.length);
    if (scoredCandidates.length < 4) return [];

    for (let i = 0; i < Math.min(minPlayers, scoredCandidates.length); i++) {
      for (let j = i + 1; j < Math.min(minPlayers + 1, scoredCandidates.length); j++) {
        for (let k = j + 1; k < Math.min(minPlayers + 2, scoredCandidates.length); k++) {
          for (let l = k + 1; l < Math.min(minPlayers + 3, scoredCandidates.length); l++) {
            sets.push([
              scoredCandidates[i].player,
              scoredCandidates[j].player,
              scoredCandidates[k].player,
              scoredCandidates[l].player,
            ]);
            if (sets.length >= 20) return sets;
          }
        }
      }
    }
    return sets;
  };

  const playerSets = generatePlayerSets();

  for (const playerSet of playerSets) {
    const setKey = playerSet.map(p => p.id).sort().join('-');
    if (processedPlayerSets.has(setKey)) continue;
    processedPlayerSets.add(setKey);

    // Fix 3: pass sessionId so split penalty is factored into ranking
    const combinations = findBalancedTeams(playerSet, 3, groupByTier, sessionId);

    for (const player of playerSet) {
      const restState = getPlayerRestState(sessionId, player.id);
      if (restState.needsRest) {
        const warningMsg = `${player.name} has played ${restState.consecutiveGames} consecutive games`;
        if (!restWarnings.includes(warningMsg)) restWarnings.push(warningMsg);
      }
    }

    allCombinations.push(...combinations);
  }

  // Sort: tier homogeneity → skill gap → split penalty → variance
  allCombinations.sort((a, b) => {
    if (groupByTier) {
      const tierDiff = a.tierDispersion - b.tierDispersion;
      if (tierDiff !== 0) return tierDiff;
    }
    if (Math.abs(a.skillGap - b.skillGap) >= 0.01) return a.skillGap - b.skillGap;
    const penaltyDiff = a.splitPenalty - b.splitPenalty;
    if (penaltyDiff !== 0) return penaltyDiff;
    return a.variance - b.variance;
  });

  allCombinations.forEach((combo, index) => { combo.rank = index + 1; });

  return {
    allCombinations: allCombinations.slice(0, maxOptions),
    restWarnings,
  };
}
