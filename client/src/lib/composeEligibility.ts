import type { Player } from "@shared/schema";

/**
 * Gate 1 (D4 compose) — who a captain may put on a court's next lineup.
 *
 * Lifted verbatim from the swap-candidate rule the strip already uses
 * (UpNextStrip swapCandidates): the queue minus sitting-out, minus anyone in
 * a live game on ANOTHER court (Gate A's session-wide truth), minus anyone
 * held by another court's open row — PLUS this court's own current players,
 * because a same-court repeat is legal and the captain composes the lineup
 * that follows this very game.
 *
 * Pure and dependency-free so the sheet, the strip and the tests share one
 * definition. The server re-validates every id at submit (findLineupConflicts
 * → 409); this only keeps ineligible players out of the picker.
 */
export interface ComposeEligibilityInput {
  /** session queue, already resolved to Player objects */
  queuePlayers: Player[];
  /** this court's current (mid-game) players — legal to re-pick */
  ownCourtPlayers: Player[];
  /** player ids sitting out this session */
  sittingOut: Set<string>;
  /** session-wide "in a live game right now" ids (Gate A truth) */
  playing: Set<string>;
  /** ids held by ANOTHER court's open suggestion row */
  claimedElsewhere: Set<string>;
  /** ids already placed on the lineup being composed */
  alreadyPicked: Set<string>;
  /** this court's own player ids — a live player here is still selectable */
  ownCourtIds: Set<string>;
}

export function composeCandidates(input: ComposeEligibilityInput): Player[] {
  const {
    queuePlayers, ownCourtPlayers, sittingOut, playing,
    claimedElsewhere, alreadyPicked, ownCourtIds,
  } = input;

  const fromQueue = queuePlayers.filter(
    (p) =>
      !sittingOut.has(p.id) &&
      // live on another court — the assign/pin guards would 409 this anyway
      !(playing.has(p.id) && !ownCourtIds.has(p.id)) &&
      !claimedElsewhere.has(p.id) &&
      !alreadyPicked.has(p.id),
  );

  const fromOwnCourt = ownCourtPlayers.filter(
    (p) =>
      !sittingOut.has(p.id) &&
      !claimedElsewhere.has(p.id) &&
      !alreadyPicked.has(p.id) &&
      !fromQueue.some((q) => q.id === p.id),
  );

  return [...fromQueue, ...fromOwnCourt];
}

/**
 * Pre-submit check, mirroring the strip's preflight: ids that a fresh look at
 * the cache says are already gone. Returns NAMES (ids are never shown).
 */
export function composePreflightNames(
  memberIds: string[],
  opts: {
    claimedElsewhere: Set<string>;
    playing: Set<string>;
    ownCourtIds: Set<string>;
    nameOfId: (id: string) => string | undefined;
  },
): string[] {
  return memberIds
    .filter(
      (id) =>
        opts.claimedElsewhere.has(id) ||
        (opts.playing.has(id) && !opts.ownCourtIds.has(id)),
    )
    .map((id) => opts.nameOfId(id) ?? "")
    .filter(Boolean);
}
