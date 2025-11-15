import { Player, GameParticipant } from '@shared/schema';

// Player rest state tracking
interface PlayerRestState {
  playerId: string;
  consecutiveGames: number;
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
    lastGameEndedAt: null,
    needsRest: false,
  };

  if (played) {
    current.consecutiveGames += 1;
    current.lastGameEndedAt = new Date();
    current.needsRest = current.consecutiveGames >= 2;
  } else {
    // Player sat out a game - reset their consecutive count
    current.consecutiveGames = 0;
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
    lastGameEndedAt: null,
    needsRest: false,
  };
}

/**
 * Clear all rest states for a session (called when session ends)
 */
export function clearSessionRestStates(sessionId: string): void {
  sessionRestStates.delete(sessionId);
}

/**
 * Build rest states from game history
 * Analyzes the last N games to determine who played consecutively
 */
export function buildRestStatesFromHistory(
  sessionId: string,
  gameParticipants: (GameParticipant & { createdAt: Date })[],
  allPlayerIds: string[]
): void {
  // Sort games by creation time (oldest to newest)
  const sortedGames = [...gameParticipants].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  // Group by game ID
  const gameGroups = new Map<string, (GameParticipant & { createdAt: Date })[]>();
  for (const participant of sortedGames) {
    if (!gameGroups.has(participant.gameId)) {
      gameGroups.set(participant.gameId, []);
    }
    gameGroups.get(participant.gameId)!.push(participant);
  }

  // Get unique game IDs in order
  const orderedGameIds = Array.from(new Set(sortedGames.map(p => p.gameId)));

  // Initialize all player states
  const states = getSessionRestStates(sessionId);
  for (const playerId of allPlayerIds) {
    states.set(playerId, {
      playerId,
      consecutiveGames: 0,
      lastGameEndedAt: null,
      needsRest: false,
    });
  }

  // Process games in order, tracking consecutive plays
  for (const gameId of orderedGameIds) {
    const participants = gameGroups.get(gameId) || [];
    const playerIdsInGame = new Set(participants.map(p => p.playerId));

    // Update states for all players
    for (const playerId of allPlayerIds) {
      const current = states.get(playerId)!;
      
      if (playerIdsInGame.has(playerId)) {
        // Player participated
        current.consecutiveGames += 1;
        current.lastGameEndedAt = participants[0].createdAt;
      } else {
        // Player sat out - reset consecutive count
        current.consecutiveGames = 0;
      }

      current.needsRest = current.consecutiveGames >= 2;
      states.set(playerId, current);
    }
  }
}

/**
 * Calculate all possible 2v2 team combinations from 4 players
 * There are only 3 unique ways to split 4 players into 2 teams of 2
 */
function getAllTeamPermutations(players: Player[]): [Player[], Player[]][] {
  if (players.length !== 4) return [];

  const [p0, p1, p2, p3] = players;

  // All 3 unique 2v2 splits:
  return [
    [[p0, p1], [p2, p3]], // Split 1: 01 vs 23
    [[p0, p2], [p1, p3]], // Split 2: 02 vs 13
    [[p0, p3], [p1, p2]], // Split 3: 03 vs 12
  ];
}

/**
 * Calculate balance metrics for a team combination
 */
function calculateTeamMetrics(team1: Player[], team2: Player[]): {
  team1Avg: number;
  team2Avg: number;
  skillGap: number;
  variance: number;
} {
  const team1Skills = team1.map(p => p.skillScore || 100);
  const team2Skills = team2.map(p => p.skillScore || 100);

  const team1Avg = team1Skills.reduce((a, b) => a + b, 0) / team1Skills.length;
  const team2Avg = team2Skills.reduce((a, b) => a + b, 0) / team2Skills.length;

  const skillGap = Math.abs(team1Avg - team2Avg);

  // Calculate variance across all players (measures overall spread)
  const allSkills = [...team1Skills, ...team2Skills];
  const mean = (team1Avg + team2Avg) / 2;
  const variance = allSkills.reduce((sum, skill) => sum + Math.pow(skill - mean, 2), 0) / allSkills.length;

  return { team1Avg, team2Avg, skillGap, variance };
}

/**
 * Find the best balanced team combinations from a set of 4 players
 * Returns top N combinations ranked by balance quality
 */
export function findBalancedTeams(
  players: Player[],
  topN: number = 5
): TeamCombination[] {
  if (players.length !== 4) {
    throw new Error('Exactly 4 players required for team assignment');
  }

  const permutations = getAllTeamPermutations(players);
  const combinations: TeamCombination[] = [];

  for (const [team1, team2] of permutations) {
    const metrics = calculateTeamMetrics(team1, team2);
    
    combinations.push({
      team1,
      team2,
      ...metrics,
      rank: 0, // Will be set after sorting
    });
  }

  // Sort by skill gap (lower is better), then by variance (lower is better)
  combinations.sort((a, b) => {
    if (Math.abs(a.skillGap - b.skillGap) < 0.01) {
      return a.variance - b.variance;
    }
    return a.skillGap - b.skillGap;
  });

  // Assign ranks
  combinations.forEach((combo, index) => {
    combo.rank = index + 1;
  });

  return combinations.slice(0, topN);
}

/**
 * Filter eligible players based on rest requirements
 * Returns players who should be prioritized (not needing rest)
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
 * Calculate player priority score for assignment
 * Lower score = higher priority
 * Now includes gamesPlayed to prioritize players with fewer games
 */
function calculatePlayerPriority(
  player: Player,
  queuePosition: number,
  restState: PlayerRestState,
  queueWeight: number = 1.0,
  restWeight: number = 100.0,
  gamesPlayedWeight: number = 0.5
): number {
  const positionScore = queuePosition * queueWeight;
  const restPenalty = restState.needsRest ? restState.consecutiveGames * restWeight : 0;
  const gamesPlayedPenalty = (player.gamesPlayed || 0) * gamesPlayedWeight;
  
  return positionScore + restPenalty + gamesPlayedPenalty;
}

/**
 * Get the best 4 players for auto-assign, considering rest and queue order
 * Expands search window beyond first 4 to find well-rested players
 */
export function selectOptimalPlayers(
  sessionId: string,
  queuePlayerIds: string[],
  allPlayers: Player[],
  windowSize: number = 8
): {
  selectedPlayers: Player[];
  restWarnings: string[];
} {
  const restWarnings: string[] = [];
  
  // Consider first N players in queue
  const candidateIds = queuePlayerIds.slice(0, Math.min(windowSize, queuePlayerIds.length));
  
  // Calculate priority scores
  const scoredCandidates = candidateIds.map((playerId, index) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return null;
    
    const restState = getPlayerRestState(sessionId, playerId);
    const priority = calculatePlayerPriority(player, index, restState);
    
    return { player, priority, restState, queuePosition: index };
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  // Sort by priority (lower = better)
  scoredCandidates.sort((a, b) => a.priority - b.priority);

  // Take top 4
  const selectedPlayers = scoredCandidates.slice(0, 4).map(c => c.player);

  // Check if any selected players need rest
  for (const candidate of scoredCandidates.slice(0, 4)) {
    if (candidate.restState.needsRest) {
      restWarnings.push(
        `${candidate.player.name} has played ${candidate.restState.consecutiveGames} consecutive games`
      );
    }
  }

  return { selectedPlayers, restWarnings };
}

/**
 * Generate multiple different sets of 4 players and their team combinations
 * Returns many more balanced options by considering different player groups
 */
export function generateAllMatchupOptions(
  sessionId: string,
  queuePlayerIds: string[],
  allPlayers: Player[],
  maxOptions: number = 15
): {
  allCombinations: TeamCombination[];
  restWarnings: string[];
} {
  const restWarnings: string[] = [];
  const allCombinations: TeamCombination[] = [];
  const processedPlayerSets = new Set<string>();
  
  // Consider a larger window for generating different player sets
  const windowSize = Math.min(12, queuePlayerIds.length);
  const candidateIds = queuePlayerIds.slice(0, windowSize);
  
  // Get player objects with their priority scores
  const scoredCandidates = candidateIds.map((playerId, index) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return null;
    
    const restState = getPlayerRestState(sessionId, playerId);
    const priority = calculatePlayerPriority(player, index, restState);
    
    return { player, priority, restState, queuePosition: index };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  
  // Sort by priority (lower = better) - prioritizes low gamesPlayed, queue position, and rest state
  scoredCandidates.sort((a, b) => a.priority - b.priority);
  
  // Generate different combinations of 4 players
  // Start with the best 4, then try different variations
  const generatePlayerSets = (): Player[][] => {
    const sets: Player[][] = [];
    const minPlayers = Math.min(8, scoredCandidates.length);
    
    if (scoredCandidates.length < 4) return [];
    
    // Generate all possible combinations of 4 players from the candidate pool
    for (let i = 0; i < Math.min(minPlayers, scoredCandidates.length); i++) {
      for (let j = i + 1; j < Math.min(minPlayers + 1, scoredCandidates.length); j++) {
        for (let k = j + 1; k < Math.min(minPlayers + 2, scoredCandidates.length); k++) {
          for (let l = k + 1; l < Math.min(minPlayers + 3, scoredCandidates.length); l++) {
            const playerSet = [
              scoredCandidates[i].player,
              scoredCandidates[j].player,
              scoredCandidates[k].player,
              scoredCandidates[l].player
            ];
            sets.push(playerSet);
            
            // Limit total sets to avoid excessive computation
            if (sets.length >= 20) return sets;
          }
        }
      }
    }
    
    return sets;
  };
  
  const playerSets = generatePlayerSets();
  
  // For each player set, generate team combinations
  for (const playerSet of playerSets) {
    // Create a unique key for this player set
    const setKey = playerSet.map(p => p.id).sort().join('-');
    
    // Skip if we've already processed this exact set
    if (processedPlayerSets.has(setKey)) continue;
    processedPlayerSets.add(setKey);
    
    // Generate all 3 team combinations for this player set
    const combinations = findBalancedTeams(playerSet, 3);
    
    // Check for rest warnings in this set
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
  
  // Sort all combinations by balance quality (skill gap, then variance)
  allCombinations.sort((a, b) => {
    if (Math.abs(a.skillGap - b.skillGap) < 0.01) {
      return a.variance - b.variance;
    }
    return a.skillGap - b.skillGap;
  });
  
  // Re-rank after sorting
  allCombinations.forEach((combo, index) => {
    combo.rank = index + 1;
  });
  
  // Return top N options
  return {
    allCombinations: allCombinations.slice(0, maxOptions),
    restWarnings
  };
}
