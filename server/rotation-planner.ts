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
//   - waiters >= 4  → every seating is ALL waiters (window: top 8 waiters);
//     seating #1 is the strict rotation pick (top-4 of the order).
//   - waiters < 4   → every seating contains ALL waiters; the remaining
//     slots enumerate current players in rotation order (window: top 8).
// Alternates exist for the Regenerate cycle; they never demote a waiter in
// favour of a current player.
export function buildRotationSeatings(
  ordered: RotationCandidate[],
  maxOptions: number = 6,
): RotationCandidate[][] {
  if (ordered.length < 4) return [];
  const waiterCount = ordered.filter(c => c.kind === 'waiter').length;

  if (waiterCount >= 4) {
    const window = ordered.slice(0, Math.min(8, waiterCount));
    return kCombinationsLex(window, 4, maxOptions);
  }

  const waiters = ordered.slice(0, waiterCount);
  const fillWindow = ordered.slice(waiterCount, waiterCount + 8);
  const fills = kCombinationsLex(fillWindow, 4 - waiterCount, maxOptions);
  return fills.map(f => [...waiters, ...f]);
}
