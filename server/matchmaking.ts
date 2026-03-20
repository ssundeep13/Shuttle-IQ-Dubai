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
  rank: number;
}

// In-memory store for player rest states per session
const sessionRestStates = new Map<string, Map<string, PlayerRestState>>();

/**
 * Initialize or get rest state for a session
 */
function getSessionRestStates(sessionId: string): Map<string, PlayerRestState> {
  if (!sessionRestStates.has(sessionId)) {
    sessionRestStates.set(sessionId, new Map());
  }
  return sessionRestStates.get(sessionId)!;
}

/**
 * Update player rest state after a game ends
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
    // Player sat out a game — reset consecutive count, increment waited
    current.consecutiveGames = 0;
    current.gamesWaited += 1;
    current.needsRest = false;
  }

  states.set(playerId, current);
}

/**
 * Get rest state for a player
 */
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

/**
 * Clear rest state for a specific player (called when player leaves queue or session)
 */
export function clearPlayerRestState(sessionId: string, playerId: string): void {
  const sessionMap = sessionRestStates.get(sessionId);
  if (sessionMap) {
    sessionMap.delete(playerId);
    if (sessionMap.size === 0) {
      sessionRestStates.delete(sessionId);
    }
  }
}

/**
 * Clear all rest states for a session (called when session ends)
 */
export function clearSessionRestStates(sessionId: string): void {
  sessionRestStates.delete(sessionId);
}

/**
 * Build rest states from game history.
 * Also tracks gamesWaited for fairness bonuses.
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
    if (!gameGroups.has(participant.gameId)) {
      gameGroups.set(participant.gameId, []);
    }
    gameGroups.get(participant.gameId)!.push(participant);
  }

  const orderedGameIds = Array.from(new Set(sortedGames.map(p => p.gameId)));

  const states = getSessionRestStates(sessionId);
  for (const playerId of allPlayerIds) {
    if (!states.has(playerId)) {
      states.set(playerId, {
        playerId,
        consecutiveGames: 0,
        gamesWaited: 0,
        lastGameEndedAt: null,
        needsRest: false,
      });
    }
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
        current.consecutiveGames = 0;
        current.gamesWaited += 1;
      }

      current.needsRest = current.consecutiveGames >= 2;
      states.set(playerId, current);
    }
  }
}

/**
 * Calculate all possible 2v2 team combinations from 4 players.
 * There are only 3 unique ways to split 4 players into 2 teams of 2.
 */
function getAllTeamPermutations(players: Player[]): [Player[], Player[]][] {
  if (players.length !== 4) return [];
  const [p0, p1, p2, p3] = players;
  return [
    [[p0, p1], [p2, p3]],
    [[p0, p2], [p1, p3]],
    [[p0, p3], [p1, p2]],
  ];
}

/**
 * Calculate balance metrics for a team combination.
 * Now also computes tierDispersion (0 = all same tier, 4 = max cross-tier span).
 */
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
  const variance = allSkills.reduce((sum, skill) => sum + Math.pow(skill - mean, 2), 0) / allSkills.length;

  const allTierIndices = allSkills.map(s => getTierIndex(s));
  const tierDispersion = Math.max(...allTierIndices) - Math.min(...allTierIndices);

  return { team1Avg, team2Avg, skillGap, variance, tierDispersion };
}

/**
 * Find the best balanced team combinations from a set of 4 players.
 * Returns top N combinations ranked by balance quality.
 * When groupByTier is true, tier homogeneity is the primary sort key.
 */
export function findBalancedTeams(
  players: Player[],
  topN: number = 5,
  groupByTier: boolean = false
): TeamCombination[] {
  if (players.length !== 4) {
    throw new Error('Exactly 4 players required for team assignment');
  }

  const permutations = getAllTeamPermutations(players);
  const combinations: TeamCombination[] = [];

  for (const [team1, team2] of permutations) {
    const metrics = calculateTeamMetrics(team1, team2);
    combinations.push({ team1, team2, ...metrics, rank: 0 });
  }

  combinations.sort((a, b) => {
    if (groupByTier) {
      const tierDiff = a.tierDispersion - b.tierDispersion;
      if (tierDiff !== 0) return tierDiff;
    }
    if (Math.abs(a.skillGap - b.skillGap) < 0.01) {
      return a.variance - b.variance;
    }
    return a.skillGap - b.skillGap;
  });

  combinations.forEach((combo, index) => { combo.rank = index + 1; });
  return combinations.slice(0, topN);
}

/**
 * Filter eligible players based on rest requirements.
 */
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
    const restState = getPlayerRestState(sessionId, playerId);
    if (restState.needsRest) {
      needingRest.push(player);
    } else {
      eligible.push(player);
    }
  }

  return { eligible, needingRest };
}

/**
 * Calculate player priority score for assignment.
 * Lower score = higher priority.
 *
 * Priority factors:
 * 1. Queue position (DOMINANT) — ensures FIFO behavior
 * 2. Games played (tiebreaker) — prefer fewer games among similar positions
 * 3. Rest requirement (penalty) — discourage consecutive games
 * 4. Waiting bonus — reward players who have been sitting out (reduces their score)
 *
 * The waiting bonus partially counteracts the rest penalty and ensures
 * resting/waiting players are not permanently overlooked by tier filtering.
 */
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
  // Waiting bonus: each game sat out reduces the player's priority score,
  // meaning they bubble up toward the front within their position bucket.
  const waitingBonus = restState.gamesWaited * waitingBonusWeight;

  return positionScore + restPenalty + gamesPlayedPenalty - waitingBonus;
}

/**
 * Select the best 4 players for auto-assign, considering rest, queue order,
 * waiting bonuses, and (optionally) skill-tier grouping.
 *
 * When groupByTier is true:
 *   1. Score all candidates as normal.
 *   2. Identify the tier of the highest-priority candidate.
 *   3. Try to select 4 from that tier (or adjacent tiers ±1).
 *   4. Fall back to the normal top-4 if no same/adjacent-tier group is possible.
 */
export function selectOptimalPlayers(
  sessionId: string,
  queuePlayerIds: string[],
  allPlayers: Player[],
  windowSize: number = 8,
  groupByTier: boolean = false
): {
  selectedPlayers: Player[];
  restWarnings: string[];
  isMixedTier: boolean;
} {
  const restWarnings: string[] = [];

  const candidateIds = queuePlayerIds.slice(0, Math.min(windowSize, queuePlayerIds.length));

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

  if (groupByTier && scoredCandidates.length >= 4) {
    const leadTier = scoredCandidates[0].tierIndex;

    // Try exact tier match first, then allow ±1 adjacent tier
    for (const tierTolerance of [0, 1]) {
      const tierCandidates = scoredCandidates.filter(
        c => Math.abs(c.tierIndex - leadTier) <= tierTolerance
      );
      if (tierCandidates.length >= 4) {
        selected = tierCandidates.slice(0, 4);
        const tiers = selected.map(c => c.tierIndex);
        isMixedTier = Math.max(...tiers) - Math.min(...tiers) > 0;
        break;
      }
    }

    // If we still couldn't find a tier group, fall back to top-4 and flag as mixed
    if (selected === scoredCandidates.slice(0, 4)) {
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
 * Generate multiple different sets of 4 players and their team combinations.
 * Returns many balanced options by considering different player groups.
 *
 * When groupByTier is true, tier homogeneity is the primary sort criterion —
 * combinations where all 4 players share the same tier appear first, followed
 * by cross-tier combinations (labelled as "mixed levels" in the UI).
 *
 * Players in the rest/waiting queue are fully included in the candidate pool.
 * Their accumulated gamesWaited gives them a priority bonus that counteracts
 * the rest penalty, ensuring long-waiting players are never permanently skipped.
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

  const windowSize = Math.min(12, queuePlayerIds.length);
  const candidateIds = queuePlayerIds.slice(0, windowSize);

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

    const combinations = findBalancedTeams(playerSet, 3, groupByTier);

    for (const player of playerSet) {
      const restState = getPlayerRestState(sessionId, player.id);
      if (restState.needsRest) {
        const warningMsg = `${player.name} has played ${restState.consecutiveGames} consecutive games`;
        if (!restWarnings.includes(warningMsg)) {
          restWarnings.push(warningMsg);
        }
      }
    }

    allCombinations.push(...combinations);
  }

  // Sort: when groupByTier, tier homogeneity is primary; otherwise pure skill-gap/variance sort
  allCombinations.sort((a, b) => {
    if (groupByTier) {
      const tierDiff = a.tierDispersion - b.tierDispersion;
      if (tierDiff !== 0) return tierDiff;
    }
    if (Math.abs(a.skillGap - b.skillGap) < 0.01) {
      return a.variance - b.variance;
    }
    return a.skillGap - b.skillGap;
  });

  allCombinations.forEach((combo, index) => { combo.rank = index + 1; });

  return {
    allCombinations: allCombinations.slice(0, maxOptions),
    restWarnings,
  };
}
