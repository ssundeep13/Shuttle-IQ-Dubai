// Gate M1 — admin player merge (absorbed → survivor) with full undo.
// Everything runs in ONE transaction in the approved order: advisory locks,
// named-error preconditions, merge-log first (pre-images + planned re-points),
// re-point history, wallet adjustment pair (the ledger is append-only — we
// NEVER modify or delete existing ledger rows), account-link move, delete the
// absorbed row, recompute the survivor with the recalculate primitive's
// semantics (counts from non-sandbox games; skill from the most recent game's
// after-score — never averaged).
import { randomUUID } from "crypto";
import { sql, eq, and, inArray, notInArray, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  players,
  gameParticipants,
  marketplaceUsers,
  playerTags,
  tagSuggestions,
  tagSuggestionVotes,
  referrals,
  bookingGuests,
  sessionRestStatesTable,
  playerLinkOtps,
  playerLinkRequests,
  playerContactChangeRequests,
  walletTransactions,
  playerMergeLog,
  feedEvents,
  feedEventLikes,
  type Player,
  type PlayerMergeLog,
} from "@shared/schema";

export class MergeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "MergeError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const OPERABLE_SESSION = sql`s.status IN ('active', 'upcoming')`;

// Deterministic lock order so two concurrent merges over the same pair can
// never deadlock.
async function lockBoth(tx: Tx, idA: string, idB: string) {
  for (const id of [idA, idB].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"player-merge:" + id}, 0))`);
  }
}

// Scoped version of POST /api/admin/recalculate-player-stats (routes.ts):
// games/wins counted from non-sandbox game history; skill restored from the
// chronologically-latest game's after-score.
async function recomputePlayer(tx: Tx, playerId: string) {
  await tx.execute(sql`
    WITH counts AS (
      SELECT COUNT(*)::int AS games_played,
             COUNT(*) FILTER (WHERE gr.winning_team = gp.team)::int AS wins
      FROM game_participants gp
      JOIN game_results gr ON gr.id = gp.game_id
      JOIN sessions s ON s.id = gr.session_id
      WHERE gp.player_id = ${playerId} AND (s.is_sandbox = false OR s.is_sandbox IS NULL)
    ),
    last_game AS (
      SELECT gp.skill_score_after AS restored_score,
        CASE
          WHEN gp.skill_score_after < 40  THEN 'Novice'
          WHEN gp.skill_score_after < 70  THEN 'Beginner'
          WHEN gp.skill_score_after < 90  THEN 'lower_intermediate'
          WHEN gp.skill_score_after < 110 THEN 'upper_intermediate'
          WHEN gp.skill_score_after < 160 THEN 'Advanced'
          ELSE 'Professional'
        END AS restored_level
      FROM game_participants gp
      JOIN game_results gr ON gr.id = gp.game_id
      WHERE gp.player_id = ${playerId}
      ORDER BY gr.created_at DESC, gp.game_id DESC
      LIMIT 1
    )
    UPDATE players p SET
      games_played         = COALESCE((SELECT games_played FROM counts), 0),
      wins                 = COALESCE((SELECT wins FROM counts), 0),
      skill_score          = COALESCE((SELECT restored_score FROM last_game), p.skill_score),
      skill_score_baseline = COALESCE((SELECT restored_score FROM last_game), p.skill_score_baseline),
      level                = COALESCE((SELECT restored_level FROM last_game), p.level)
    WHERE p.id = ${playerId}
  `);
}

// Wallet movement inside the merge transaction. Same UPDATE-guard + INSERT
// shape as walletLedger.applyWalletDelta, inlined so the ledger row id is
// known for the merge log. Throws MergeError when the balance guard refuses.
async function postWalletAdjustment(
  tx: Tx,
  playerId: string,
  deltaFils: number,
  description: string,
  adminId: string,
): Promise<string> {
  const guard = deltaFils < 0
    ? and(eq(players.id, playerId), sql`${players.walletBalance} + ${deltaFils} >= 0`)
    : eq(players.id, playerId);
  const [updated] = await tx
    .update(players)
    .set({ walletBalance: sql`${players.walletBalance} + ${deltaFils}` })
    .where(guard)
    .returning({ walletBalance: players.walletBalance });
  if (!updated) {
    throw new MergeError(
      "WALLET_MOVE_FAILED",
      "The wallet balance could not be moved (insufficient balance for the adjustment). No changes were made.",
    );
  }
  const id = randomUUID();
  await tx.insert(walletTransactions).values({
    id,
    playerId,
    amountFils: deltaFils,
    balanceAfterFils: updated.walletBalance,
    type: "adjustment",
    description,
    createdBy: adminId,
  });
  return id;
}

async function assertNotInLiveSession(tx: Tx, ids: [string, string]) {
  const checks: Array<{ q: ReturnType<typeof sql>; what: string }> = [
    {
      q: sql`SELECT 1 FROM court_players cp JOIN courts c ON c.id = cp.court_id JOIN sessions s ON s.id = c.session_id
             WHERE cp.player_id IN (${ids[0]}, ${ids[1]}) AND ${OPERABLE_SESSION} LIMIT 1`,
      what: "on a court",
    },
    {
      q: sql`SELECT 1 FROM queue_entries qe JOIN sessions s ON s.id = qe.session_id
             WHERE qe.player_id IN (${ids[0]}, ${ids[1]}) AND ${OPERABLE_SESSION} LIMIT 1`,
      what: "in the queue",
    },
    {
      q: sql`SELECT 1 FROM match_suggestion_players msp
             JOIN match_suggestions ms ON ms.id = msp.suggestion_id
             JOIN sessions s ON s.id = ms.session_id
             WHERE msp.player_id IN (${ids[0]}, ${ids[1]})
               AND ms.status NOT IN ('completed', 'dismissed') AND ${OPERABLE_SESSION} LIMIT 1`,
      what: "on an open lineup",
    },
  ];
  for (const c of checks) {
    const r = await tx.execute(c.q);
    if ((r.rows as unknown[]).length > 0) {
      throw new MergeError(
        "PLAYER_IN_SESSION",
        `One of these players is ${c.what} in a live session. Finish or remove them first — nothing was changed.`,
      );
    }
  }
}

export interface MergeSummary {
  logId: string;
  survivor: Player;
  repointed: Record<string, number>;
  walletMovedFils: number;
  accountLinkMoved: boolean;
}

export async function mergePlayers(args: {
  survivorId: string;
  absorbedId: string;
  adminId: string;
}): Promise<MergeSummary> {
  const { survivorId, absorbedId, adminId } = args;
  if (survivorId === absorbedId) {
    throw new MergeError("SAME_PLAYER", "Pick two different players to merge.");
  }

  return db.transaction(async (tx) => {
    await lockBoth(tx, survivorId, absorbedId);

    const [survivor] = await tx.select().from(players).where(eq(players.id, survivorId)).for("update");
    if (!survivor) throw new MergeError("SURVIVOR_NOT_FOUND", "The surviving player was not found.");
    const [absorbed] = await tx.select().from(players).where(eq(players.id, absorbedId)).for("update");
    if (!absorbed) throw new MergeError("ABSORBED_NOT_FOUND", "The player to merge was not found.");

    await assertNotInLiveSession(tx, [survivorId, absorbedId]);

    const collision = await tx.execute(sql`
      SELECT 1 FROM game_participants a JOIN game_participants b ON a.game_id = b.game_id
      WHERE a.player_id = ${survivorId} AND b.player_id = ${absorbedId} LIMIT 1`);
    if ((collision.rows as unknown[]).length > 0) {
      throw new MergeError(
        "GAME_COLLISION",
        "These two players appear in the same recorded game — they can't be the same person. Nothing was changed.",
      );
    }

    const [survivorOwner] = await tx.select().from(marketplaceUsers).where(eq(marketplaceUsers.linkedPlayerId, survivorId));
    const [absorbedOwner] = await tx.select().from(marketplaceUsers).where(eq(marketplaceUsers.linkedPlayerId, absorbedId));
    if (survivorOwner && absorbedOwner) {
      throw new MergeError(
        "BOTH_LINKED",
        "Both players have marketplace accounts. Decide which ACCOUNT survives first (contact the owners), then merge. Nothing was changed.",
      );
    }

    // ── Gather everything that will move (pre-mutation, for the log) ──────
    const gpGames = (await tx.execute(
      sql`SELECT game_id FROM game_participants WHERE player_id = ${absorbedId}`,
    )).rows.map((r: any) => r.game_id as string);

    const taggedRows = await tx.select({ id: playerTags.id }).from(playerTags).where(eq(playerTags.taggedPlayerId, absorbedId));
    const taggedByRows = await tx.select({ id: playerTags.id }).from(playerTags).where(eq(playerTags.taggedByPlayerId, absorbedId));
    const suggRows = await tx.select({ id: tagSuggestions.id }).from(tagSuggestions).where(eq(tagSuggestions.suggestedByPlayerId, absorbedId));

    // Tag-suggestion votes: unique (suggestion, voter) — if both identities
    // voted the same suggestion, the absorbed vote is deleted (kept verbatim
    // for undo); the rest re-point.
    const dupVotes = await tx.execute(sql`
      SELECT b.* FROM tag_suggestion_votes b
      WHERE b.voted_by_player_id = ${absorbedId}
        AND EXISTS (SELECT 1 FROM tag_suggestion_votes a
                    WHERE a.suggestion_id = b.suggestion_id AND a.voted_by_player_id = ${survivorId})`);
    const dupVoteRows = dupVotes.rows as any[];
    const dupVoteIds = dupVoteRows.map((r) => r.id as string);
    const moveVoteRows = await tx.select({ id: tagSuggestionVotes.id }).from(tagSuggestionVotes)
      .where(and(eq(tagSuggestionVotes.votedByPlayerId, absorbedId), dupVoteIds.length ? notInArray(tagSuggestionVotes.id, dupVoteIds) : sql`true`));

    const referrerRows = await tx.select({ id: referrals.id }).from(referrals).where(eq(referrals.referrerId, absorbedId));
    const refereeRows = await tx.select({ id: referrals.id }).from(referrals).where(eq(referrals.refereePlayerId, absorbedId));
    const guestRows = await tx.select({ id: bookingGuests.id }).from(bookingGuests).where(eq(bookingGuests.linkedPlayerId, absorbedId));

    // Rest states: survivor's row wins where both exist in one session.
    const dupRest = await tx.execute(sql`
      SELECT b.* FROM session_rest_states b
      WHERE b.player_id = ${absorbedId}
        AND EXISTS (SELECT 1 FROM session_rest_states a
                    WHERE a.session_id = b.session_id AND a.player_id = ${survivorId})`);
    const dupRestRows = dupRest.rows as any[];
    const dupRestIds = dupRestRows.map((r) => r.id as string);
    const moveRestRows = await tx.select({ id: sessionRestStatesTable.id }).from(sessionRestStatesTable)
      .where(and(eq(sessionRestStatesTable.playerId, absorbedId), dupRestIds.length ? notInArray(sessionRestStatesTable.id, dupRestIds) : sql`true`));

    // Pending link OTPs are voided (deleted, kept verbatim for undo);
    // consumed rows stay untouched as audit history.
    const pendingOtps = await tx.execute(
      sql`SELECT * FROM player_link_otps WHERE player_id = ${absorbedId} AND consumed_at IS NULL`,
    );
    const pendingOtpRows = pendingOtps.rows as any[];

    const pendingLinkReqs = await tx.select({ id: playerLinkRequests.id }).from(playerLinkRequests)
      .where(and(eq(playerLinkRequests.playerId, absorbedId), eq(playerLinkRequests.status, "pending")));
    const pendingContactReqs = await tx.select({ id: playerContactChangeRequests.id }).from(playerContactChangeRequests)
      .where(and(eq(playerContactChangeRequests.playerId, absorbedId), eq(playerContactChangeRequests.status, "pending")));

    // Feed events (F2): subject re-points; likes dedupe on the (event, player)
    // PK — if both identities liked the same event, the absorbed like is
    // deleted (kept verbatim for undo); the rest re-point.
    const feedSubjectRows = await tx.select({ id: feedEvents.id }).from(feedEvents).where(eq(feedEvents.subjectPlayerId, absorbedId));
    const dupLikes = await tx.execute(sql`
      SELECT b.* FROM feed_event_likes b
      WHERE b.player_id = ${absorbedId}
        AND EXISTS (SELECT 1 FROM feed_event_likes a
                    WHERE a.event_id = b.event_id AND a.player_id = ${survivorId})`);
    const dupLikeRows = dupLikes.rows as any[];
    const dupLikeEventIds = dupLikeRows.map((r) => r.event_id as string);
    const moveLikeRows = await tx.select({ eventId: feedEventLikes.eventId }).from(feedEventLikes)
      .where(and(eq(feedEventLikes.playerId, absorbedId), dupLikeEventIds.length ? notInArray(feedEventLikes.eventId, dupLikeEventIds) : sql`true`));

    const repointed = {
      game_participants: gpGames,
      player_tags_tagged: taggedRows.map((r) => r.id),
      player_tags_tagged_by: taggedByRows.map((r) => r.id),
      tag_suggestions: suggRows.map((r) => r.id),
      tag_suggestion_votes: moveVoteRows.map((r) => r.id),
      referrals_referrer: referrerRows.map((r) => r.id),
      referrals_referee: refereeRows.map((r) => r.id),
      booking_guests: guestRows.map((r) => r.id),
      session_rest_states: moveRestRows.map((r) => r.id),
      player_link_requests_voided: pendingLinkReqs.map((r) => r.id),
      player_contact_changes_cancelled: pendingContactReqs.map((r) => r.id),
      feed_events_subject: feedSubjectRows.map((r) => r.id),
      feed_event_likes: moveLikeRows.map((r) => r.eventId),
    };
    const restoreRows = {
      tag_suggestion_votes: dupVoteRows,
      session_rest_states: dupRestRows,
      player_link_otps: pendingOtpRows,
      feed_event_likes: dupLikeRows,
    };

    // ── Merge log FIRST — the undo record exists before anything moves ────
    const logId = randomUUID();
    await tx.insert(playerMergeLog).values({
      id: logId,
      survivorId,
      absorbedId,
      adminId,
      absorbedSnapshot: absorbed as any,
      survivorSnapshot: {
        gamesPlayed: survivor.gamesPlayed,
        wins: survivor.wins,
        skillScore: survivor.skillScore,
        skillScoreBaseline: survivor.skillScoreBaseline,
        level: survivor.level,
        walletBalance: survivor.walletBalance,
      } as any,
      repointed: repointed as any,
      restoreRows: restoreRows as any,
      walletMovedFils: absorbed.walletBalance,
      status: "applied",
    });

    // ── Re-point history ──────────────────────────────────────────────────
    await tx.update(gameParticipants).set({ playerId: survivorId }).where(eq(gameParticipants.playerId, absorbedId));
    await tx.update(playerTags).set({ taggedPlayerId: survivorId }).where(eq(playerTags.taggedPlayerId, absorbedId));
    await tx.update(playerTags).set({ taggedByPlayerId: survivorId }).where(eq(playerTags.taggedByPlayerId, absorbedId));
    await tx.update(tagSuggestions).set({ suggestedByPlayerId: survivorId }).where(eq(tagSuggestions.suggestedByPlayerId, absorbedId));
    if (dupVoteIds.length) await tx.delete(tagSuggestionVotes).where(inArray(tagSuggestionVotes.id, dupVoteIds));
    await tx.update(tagSuggestionVotes).set({ votedByPlayerId: survivorId }).where(eq(tagSuggestionVotes.votedByPlayerId, absorbedId));
    await tx.update(referrals).set({ referrerId: survivorId }).where(eq(referrals.referrerId, absorbedId));
    await tx.update(referrals).set({ refereePlayerId: survivorId }).where(eq(referrals.refereePlayerId, absorbedId));
    await tx.update(bookingGuests).set({ linkedPlayerId: survivorId }).where(eq(bookingGuests.linkedPlayerId, absorbedId));
    if (dupRestIds.length) await tx.delete(sessionRestStatesTable).where(inArray(sessionRestStatesTable.id, dupRestIds));
    await tx.update(sessionRestStatesTable).set({ playerId: survivorId }).where(eq(sessionRestStatesTable.playerId, absorbedId));
    if (pendingOtpRows.length) {
      await tx.delete(playerLinkOtps).where(and(eq(playerLinkOtps.playerId, absorbedId), isNull(playerLinkOtps.consumedAt)));
    }
    if (pendingLinkReqs.length) {
      await tx.update(playerLinkRequests)
        .set({ status: "rejected", resolutionNote: `Player merged into ${survivor.shuttleIqId ?? survivorId}`, resolvedAt: new Date() })
        .where(inArray(playerLinkRequests.id, pendingLinkReqs.map((r) => r.id)));
    }
    if (pendingContactReqs.length) {
      await tx.update(playerContactChangeRequests)
        .set({ status: "cancelled" })
        .where(inArray(playerContactChangeRequests.id, pendingContactReqs.map((r) => r.id)));
    }
    await tx.update(feedEvents).set({ subjectPlayerId: survivorId }).where(eq(feedEvents.subjectPlayerId, absorbedId));
    if (dupLikeEventIds.length) {
      await tx.delete(feedEventLikes).where(and(eq(feedEventLikes.playerId, absorbedId), inArray(feedEventLikes.eventId, dupLikeEventIds)));
    }
    await tx.update(feedEventLikes).set({ playerId: survivorId }).where(eq(feedEventLikes.playerId, absorbedId));

    // ── Wallet: offsetting adjustment pair — never touch existing rows ────
    let walletDebitTxId: string | null = null;
    let walletCreditTxId: string | null = null;
    if (absorbed.walletBalance !== 0) {
      const desc = `merge ${absorbed.shuttleIqId ?? absorbedId} → ${survivor.shuttleIqId ?? survivorId}`;
      walletDebitTxId = await postWalletAdjustment(tx, absorbedId, -absorbed.walletBalance, desc, adminId);
      walletCreditTxId = await postWalletAdjustment(tx, survivorId, absorbed.walletBalance, desc, adminId);
      await tx.update(playerMergeLog).set({ walletDebitTxId, walletCreditTxId }).where(eq(playerMergeLog.id, logId));
    }

    // ── Account link: absorbed's account follows the surviving player ─────
    let accountLinkMoved = false;
    if (absorbedOwner && !survivorOwner) {
      await tx.update(marketplaceUsers).set({ linkedPlayerId: survivorId }).where(eq(marketplaceUsers.id, absorbedOwner.id));
      await tx.update(playerMergeLog).set({ accountLinkMovedUserId: absorbedOwner.id }).where(eq(playerMergeLog.id, logId));
      accountLinkMoved = true;
      console.info(
        `[audit] player-merge link move by adminId=${adminId}: marketplaceUser ${absorbedOwner.id} (${absorbedOwner.email}) re-linked ${absorbedId} → ${survivorId} (merge ${logId})`,
      );
    }

    // ── Delete the absorbed row, recompute the survivor ───────────────────
    await tx.delete(players).where(eq(players.id, absorbedId));
    await recomputePlayer(tx, survivorId);

    const [recomputed] = await tx.select().from(players).where(eq(players.id, survivorId));
    console.info(`[audit] player-merge by adminId=${adminId}: ${absorbedId} → ${survivorId} (log ${logId})`);
    return {
      logId,
      survivor: recomputed as Player,
      repointed: Object.fromEntries(Object.entries(repointed).map(([k, v]) => [k, (v as string[]).length])),
      walletMovedFils: absorbed.walletBalance,
      accountLinkMoved,
    };
  });
}

export async function undoPlayerMerge(args: { logId: string; adminId: string }): Promise<{ log: PlayerMergeLog }> {
  const { logId, adminId } = args;
  return db.transaction(async (tx) => {
    const [log] = await tx.select().from(playerMergeLog).where(eq(playerMergeLog.id, logId)).for("update");
    if (!log) throw new MergeError("MERGE_NOT_FOUND", "That merge was not found.");
    if (log.status === "undone") {
      throw new MergeError("ALREADY_UNDONE", "This merge has already been undone. Nothing was changed.");
    }

    await lockBoth(tx, log.survivorId, log.absorbedId);

    const [existing] = await tx.select().from(players).where(eq(players.id, log.absorbedId));
    if (existing) {
      throw new MergeError("ABSORBED_ID_TAKEN", "A player already exists with the absorbed player's id — cannot undo.");
    }

    // Re-insert the absorbed player from the pre-merge snapshot. The wallet
    // balance starts at 0 when a reversal is due — the reversing credit below
    // restores it, so the ledger stays replay-consistent (the merge debit row
    // ended at 0; the undo credit row ends back at the pre-merge balance).
    const snap = log.absorbedSnapshot as any;
    await tx.insert(players).values({
      ...snap,
      walletBalance: log.walletMovedFils !== 0 ? 0 : (snap.walletBalance ?? 0),
      createdAt: snap.createdAt ? new Date(snap.createdAt) : new Date(),
      lastPlayedAt: snap.lastPlayedAt ? new Date(snap.lastPlayedAt) : null,
    });

    // Reverse the re-points — ONLY the recorded rows. Games recorded before
    // the merge return to the absorbed player; games played after it stay on
    // the survivor (they were genuinely played as the survivor).
    const rp = log.repointed as Record<string, string[]>;
    if (rp.game_participants?.length) {
      await tx.update(gameParticipants)
        .set({ playerId: log.absorbedId })
        .where(and(eq(gameParticipants.playerId, log.survivorId), inArray(gameParticipants.gameId, rp.game_participants)));
    }
    if (rp.player_tags_tagged?.length) {
      await tx.update(playerTags).set({ taggedPlayerId: log.absorbedId }).where(inArray(playerTags.id, rp.player_tags_tagged));
    }
    if (rp.player_tags_tagged_by?.length) {
      await tx.update(playerTags).set({ taggedByPlayerId: log.absorbedId }).where(inArray(playerTags.id, rp.player_tags_tagged_by));
    }
    if (rp.tag_suggestions?.length) {
      await tx.update(tagSuggestions).set({ suggestedByPlayerId: log.absorbedId }).where(inArray(tagSuggestions.id, rp.tag_suggestions));
    }
    if (rp.tag_suggestion_votes?.length) {
      await tx.update(tagSuggestionVotes).set({ votedByPlayerId: log.absorbedId }).where(inArray(tagSuggestionVotes.id, rp.tag_suggestion_votes));
    }
    if (rp.referrals_referrer?.length) {
      await tx.update(referrals).set({ referrerId: log.absorbedId }).where(inArray(referrals.id, rp.referrals_referrer));
    }
    if (rp.referrals_referee?.length) {
      await tx.update(referrals).set({ refereePlayerId: log.absorbedId }).where(inArray(referrals.id, rp.referrals_referee));
    }
    if (rp.booking_guests?.length) {
      await tx.update(bookingGuests).set({ linkedPlayerId: log.absorbedId }).where(inArray(bookingGuests.id, rp.booking_guests));
    }
    if (rp.session_rest_states?.length) {
      await tx.update(sessionRestStatesTable).set({ playerId: log.absorbedId }).where(inArray(sessionRestStatesTable.id, rp.session_rest_states));
    }
    if (rp.player_link_requests_voided?.length) {
      // Best effort: restore to pending only where no newer pending row for
      // the same user would collide with the partial unique indexes.
      for (const id of rp.player_link_requests_voided) {
        const [row] = await tx.select().from(playerLinkRequests).where(eq(playerLinkRequests.id, id));
        if (!row) continue;
        const conflict = await tx.execute(sql`
          SELECT 1 FROM player_link_requests
          WHERE marketplace_user_id = ${row.marketplaceUserId} AND status = 'pending'
            AND (player_id = ${row.playerId} OR (player_id IS NULL AND ${row.playerId}::varchar IS NULL))
          LIMIT 1`);
        if ((conflict.rows as unknown[]).length === 0) {
          await tx.update(playerLinkRequests)
            .set({ status: "pending", resolutionNote: null, resolvedAt: null })
            .where(eq(playerLinkRequests.id, id));
        }
      }
    }
    if (rp.player_contact_changes_cancelled?.length) {
      await tx.update(playerContactChangeRequests).set({ status: "pending" })
        .where(inArray(playerContactChangeRequests.id, rp.player_contact_changes_cancelled));
    }
    if (rp.feed_events_subject?.length) {
      await tx.update(feedEvents).set({ subjectPlayerId: log.absorbedId }).where(inArray(feedEvents.id, rp.feed_events_subject));
    }
    if (rp.feed_event_likes?.length) {
      await tx.update(feedEventLikes).set({ playerId: log.absorbedId })
        .where(and(eq(feedEventLikes.playerId, log.survivorId), inArray(feedEventLikes.eventId, rp.feed_event_likes)));
    }

    // Restore dedupe-deleted rows verbatim.
    const rr = log.restoreRows as Record<string, any[]>;
    for (const row of rr.tag_suggestion_votes ?? []) {
      await tx.execute(sql`
        INSERT INTO tag_suggestion_votes (id, suggestion_id, voted_by_player_id, created_at)
        VALUES (${row.id}, ${row.suggestion_id}, ${row.voted_by_player_id}, ${row.created_at})`);
    }
    for (const row of rr.session_rest_states ?? []) {
      await tx.execute(sql`
        INSERT INTO session_rest_states (id, session_id, player_id, consecutive_games, games_waited, games_this_session, needs_rest, is_sitting_out, updated_at)
        VALUES (${row.id}, ${row.session_id}, ${row.player_id}, ${row.consecutive_games}, ${row.games_waited}, ${row.games_this_session}, ${row.needs_rest}, ${row.is_sitting_out}, ${row.updated_at})`);
    }
    for (const row of rr.player_link_otps ?? []) {
      await tx.execute(sql`
        INSERT INTO player_link_otps (id, marketplace_user_id, player_id, channel, destination, code_hash, attempts, expires_at, consumed_at, created_at)
        VALUES (${row.id}, ${row.marketplace_user_id}, ${row.player_id}, ${row.channel}, ${row.destination}, ${row.code_hash}, ${row.attempts}, ${row.expires_at}, ${row.consumed_at}, ${row.created_at})`);
    }
    for (const row of rr.feed_event_likes ?? []) {
      await tx.execute(sql`
        INSERT INTO feed_event_likes (event_id, player_id, created_at)
        VALUES (${row.event_id}, ${row.player_id}, ${row.created_at})`);
    }

    // Wallet: reverse with a NEW offsetting pair (append-only ledger).
    if (log.walletMovedFils !== 0 && log.walletDebitTxId) {
      const desc = `undo merge ${(log.absorbedSnapshot as any).shuttleIqId ?? log.absorbedId} (log ${log.id})`;
      await postWalletAdjustment(tx, log.survivorId, -log.walletMovedFils, desc, adminId);
      await postWalletAdjustment(tx, log.absorbedId, log.walletMovedFils, desc, adminId);
    }

    // Account link back, unless an admin has since re-pointed it elsewhere.
    if (log.accountLinkMovedUserId) {
      const [owner] = await tx.select().from(marketplaceUsers).where(eq(marketplaceUsers.id, log.accountLinkMovedUserId));
      if (owner && owner.linkedPlayerId === log.survivorId) {
        await tx.update(marketplaceUsers).set({ linkedPlayerId: log.absorbedId }).where(eq(marketplaceUsers.id, owner.id));
      } else {
        console.warn(`[audit] undo merge ${log.id}: account link NOT restored (user ${log.accountLinkMovedUserId} no longer points at survivor)`);
      }
    }

    await recomputePlayer(tx, log.survivorId);
    await recomputePlayer(tx, log.absorbedId);

    const [updatedLog] = await tx.update(playerMergeLog)
      .set({ status: "undone", undoneAt: new Date(), undoneByAdminId: adminId })
      .where(eq(playerMergeLog.id, logId))
      .returning();
    console.info(`[audit] player-merge UNDO by adminId=${adminId}: log ${logId} (${log.absorbedId} restored)`);
    return { log: updatedLog as PlayerMergeLog };
  });
}
