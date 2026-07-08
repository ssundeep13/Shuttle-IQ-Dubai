// Rotation Planner (Gate 4) — inverted selection. WHO plays next is decided
// by rotation-fairness rules; only the ARRANGEMENT of the chosen four is
// decided by balance. This is deliberately NOT a re-weighting of
// calculatePlayerPriority: the 5-factor option sort ignores gamesWaited
// entirely, so no weight tuning can express "waiters strictly first".
//
// Rules (owner ruling, 2026-07-07):
//   1. WAITERS FIRST — every seating places waiters before ANY currently-
//      playing player takes a slot. Waiter order: gamesWaited desc, then
//      queue position asc.
//   2. Remaining slots go to the court's OWN current players (court-scoped
//      exemption, never cross-court), most-rested first: fewest games this
//      session, then oldest last-game-end. Both derived from
//      game_participants ⋈ game_results — restart-safe by construction;
//      the in-memory rest state is never consulted for rotation order.
//   3. The chosen four are arranged for balance by the EXISTING
//      3-permutation machinery (findBalancedTeams) unchanged.
//
// This module is pure: no DB, no in-memory session state. Callers supply
// the candidate lists; enforcement of queue/sit-out/cross-court claims
// stays where it lives today (routes + auto-matchmaking).

import { Player, GameParticipant } from '@shared/schema';

export interface RotationCandidate {
  player: Player;
  kind: 'waiter' | 'current';
  // Waiter ordering inputs (ignored for kind='current')
  gamesWaited: number; // queue-fairness counter (sit-out-frozen)
  queueIndex: number; // position in the session queue
  // Current-player ordering inputs (ignored for kind='waiter')
  gamesThisSession: number; // from the game_participants ⋈ game_results join
  lastGameEndedAt: Date | null; // max(game_results.createdAt) for the player
}

// Per-player session play facts from the participants join (the rows
// storage.getSessionGameParticipants already returns). Restart-safe: this is
// recorded game history, not a counter that can miss a persist.
export function deriveSessionPlayFromHistory(
  history: Array<GameParticipant & { createdAt: Date }>,
): Map<string, { gamesThisSession: number; lastGameEndedAt: Date }> {
  const byPlayer = new Map<string, { gamesThisSession: number; lastGameEndedAt: Date }>();
  for (const row of history) {
    const cur = byPlayer.get(row.playerId);
    if (!cur) {
      byPlayer.set(row.playerId, { gamesThisSession: 1, lastGameEndedAt: row.createdAt });
    } else {
      cur.gamesThisSession += 1;
      if (row.createdAt > cur.lastGameEndedAt) cur.lastGameEndedAt = row.createdAt;
    }
  }
  return byPlayer;
}

// Full rotation order: every waiter strictly before every current player.
export function orderRotationCandidates(
  waiters: RotationCandidate[],
  currents: RotationCandidate[],
): RotationCandidate[] {
  const w = [...waiters].sort(
    (a, b) => b.gamesWaited - a.gamesWaited || a.queueIndex - b.queueIndex,
  );
  const c = [...currents].sort(
    (a, b) =>
      a.gamesThisSession - b.gamesThisSession ||
      (a.lastGameEndedAt?.getTime() ?? 0) - (b.lastGameEndedAt?.getTime() ?? 0),
  );
  return [...w, ...c];
}

// Recent partners/opponents per player from the participants join rows
// (newest first, max 3 each) — feeds the AI lineup-options prompt so it can
// prefer fresh pairings. Pure; rows arrive ordered newest-first already
// (storage.getSessionGameParticipants orders desc by createdAt).
export function deriveRecentPairings(
  history: Array<GameParticipant & { createdAt: Date }>,
): Map<string, { partnerIds: string[]; opponentIds: string[] }> {
  const byGame = new Map<string, Array<GameParticipant & { createdAt: Date }>>();
  const gameOrder: string[] = []; // newest first, insertion order of the rows
  for (const row of history) {
    if (!byGame.has(row.gameId)) {
      byGame.set(row.gameId, []);
      gameOrder.push(row.gameId);
    }
    byGame.get(row.gameId)!.push(row);
  }
  const out = new Map<string, { partnerIds: string[]; opponentIds: string[] }>();
  const add = (list: string[], id: string) => {
    if (list.length < 3 && !list.includes(id)) list.push(id);
  };
  for (const gameId of gameOrder) {
    const rows = byGame.get(gameId)!;
    for (const row of rows) {
      if (!out.has(row.playerId)) out.set(row.playerId, { partnerIds: [], opponentIds: [] });
      const entry = out.get(row.playerId)!;
      for (const other of rows) {
        if (other.playerId === row.playerId) continue;
        if (other.team === row.team) add(entry.partnerIds, other.playerId);
        else add(entry.opponentIds, other.playerId);
      }
    }
  }
  return out;
}

// Order-insensitive identity of a 2v2 pairing: same four players in the
// same team split → same key, regardless of team order or within-team order.
export function pairingKey(team1Ids: string[], team2Ids: string[]): string {
  const side = (ids: string[]) => [...ids].sort().join('+');
  return [side(team1Ids), side(team2Ids)].sort().join('|');
}

// Identical-repeat guard (owner ruling): the exact current on-court pairing
// is never the picked arrangement unless it is literally the only one —
// prefer any remixed split of the same (or different) four.
export function pickArrangement<T extends { team1: Array<{ id: string }>; team2: Array<{ id: string }> }>(
  ranked: T[],
  currentKey: string | null,
): T | undefined {
  if (ranked.length === 0) return undefined;
  if (!currentKey) return ranked[0];
  return (
    ranked.find(c => pairingKey(c.team1.map(p => p.id), c.team2.map(p => p.id)) !== currentKey) ??
    ranked[0]
  );
}

// Lexicographic k-combinations over an already-ordered list, capped.
function kCombinationsLex<T>(items: T[], k: number, cap: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  if (k <= 0 || k > n) return k === 0 ? [[]] : [];
  const idx = Array.from({ length: k }, (_, i) => i);
  while (out.length < cap) {
    out.push(idx.map(i => items[i]));
    // advance to next lexicographic combination
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

// Enumerate rotation-legal seatings (4 candidates each) from the ordered
// list. Invariants:
//   - waiters >= 4  → every seating is ALL waiters (window: top 10 waiters);
//     seating #1 is the strict rotation pick (top-4 of the order).
//   - waiters < 4   → every seating contains ALL waiters; the remaining
//     slots enumerate current players in rotation order (window: top 8).
// The FULL window is enumerated (C(10,4)=210 worst case — cheap): capping
// during enumeration was discarding better-balanced combinations before the
// ranking ever scored them. Rotation decides WHO is in the window; the
// caller ranks the arranged seatings by balance (rankByBalance) and caps
// what it returns to the UI.
export function buildRotationSeatings(ordered: RotationCandidate[]): RotationCandidate[][] {
  if (ordered.length < 4) return [];
  const waiterCount = ordered.filter(c => c.kind === 'waiter').length;

  if (waiterCount >= 4) {
    const window = ordered.slice(0, Math.min(10, waiterCount));
    return kCombinationsLex(window, 4, Number.MAX_SAFE_INTEGER);
  }

  const waiters = ordered.slice(0, waiterCount);
  const fillWindow = ordered.slice(waiterCount, waiterCount + 8);
  const fills = kCombinationsLex(fillWindow, 4 - waiterCount, Number.MAX_SAFE_INTEGER);
  return fills.map(f => [...waiters, ...f]);
}

// A fair game: team averages within this many skill points. Derived from
// the live tier geometry — tiers are 30-50 points wide, and observed gaps
// cluster <5 for good games; >8 is more than a fifth of a tier apart and
// reads lopsided on court. Above it the UI shows "best available — teams
// uneven" instead of presenting the option as a good match.
export const FAIR_GAME_GAP = 8;

// Balance-first option ranking (owner ruling): among rotation-legal
// seatings, the lowest skill gap wins. Stable sort — equal gaps keep
// rotation order, so fairness still breaks balance ties.
export function rankByBalance<T extends { skillGap: number }>(arranged: T[]): T[] {
  return [...arranged].sort((a, b) => a.skillGap - b.skillGap);
}
