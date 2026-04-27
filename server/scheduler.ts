import { storage } from "./storage";
import { sendSessionReminderEmail, sendWaitlistPromotionEmail, sendGuestBookingEmail } from "./emailClient";
import { db } from "./db";
import { players } from "@shared/schema";
import { sql } from "drizzle-orm";

const REMINDER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PAYMENT_WINDOW_MS = 4 * 60 * 60 * 1000; // 4-hour payment window for waitlist promotions
const RESUME_TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const AUTO_APPROVE_SWEEP_INTERVAL_MS = 15 * 1000; // 15 seconds — pending match suggestions auto-approve once their pendingUntil window passes

const MIN_SKILL_SCORE = 10;
const INACTIVITY_THRESHOLD_DAYS = 14;

function getSkillTierFromScore(score: number): string {
  if (score < 40) return 'Novice';
  if (score < 70) return 'Beginner';
  if (score < 90) return 'lower_intermediate';
  if (score < 110) return 'upper_intermediate';
  if (score < 160) return 'Advanced';
  return 'Professional';
}

async function runReminderJob(): Promise<void> {
  try {
    const bookings = await storage.getBookingsNeedingReminder();
    if (bookings.length === 0) return;

    console.log(`[Scheduler] Processing ${bookings.length} session reminder(s)...`);
    for (const booking of bookings) {
      if (!booking.user?.email) continue;
      try {
        // sendSessionReminderEmail rethrows on failure — only mark sent when it succeeds
        await sendSessionReminderEmail(booking.user.email, booking.user.name, booking.session);
        await storage.updateBooking(booking.id, { reminderSentAt: new Date() });
      } catch (emailErr) {
        // Log but leave reminderSentAt unset so the next scheduler run retries
        console.error(`[Scheduler] Reminder failed for booking ${booking.id} (${booking.user.email}):`, emailErr);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Reminder job error:', err);
  }
}

/**
 * Tiered decay relative to skillScoreBaseline. Strictly steeper per tier, cap −50.
 *   weeks 0–1: 0 | weeks 2–3: −3/wk | weeks 4–7: −4/wk | week 8+: −5/wk (cap −50)
 * Idempotent: uses baseline as anchor so repeated runs don't compound the reduction.
 * Only players with a non-null lastPlayedAt are considered.
 */
function calculateDecayPoints(daysInactive: number): number {
  const weeks = Math.floor(daysInactive / 7);
  if (weeks < 2) return 0;
  if (weeks < 4) return (weeks - 1) * 3;
  if (weeks < 8) return 6 + (weeks - 3) * 4;
  return Math.min(22 + (weeks - 7) * 5, 50);
}

async function runInactivityDecayJob(): Promise<void> {
  try {
    const now = new Date();
    // Inclusive: players inactive for >= 14 days (use strictly-less-than threshold date)
    const thresholdDate = new Date(now.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    // Only fetch players where lastPlayedAt is set AND is older than the threshold.
    // Never fall back to createdAt — that caused all historical players to appear
    // maximally inactive and decay to the score floor.
    const inactivePlayers = await db
      .select()
      .from(players)
      .where(
        sql`${players.lastPlayedAt} IS NOT NULL AND ${players.lastPlayedAt} <= ${thresholdDate}`
      );

    if (inactivePlayers.length === 0) return;

    console.log(`[Scheduler] Inactivity decay: checking ${inactivePlayers.length} inactive player(s)...`);

    let decayCount = 0;
    for (const player of inactivePlayers) {
      const referenceDate = player.lastPlayedAt!;
      const msInactive = now.getTime() - referenceDate.getTime();
      const daysInactive = msInactive / (24 * 60 * 60 * 1000);

      // Use the stored skillScoreBaseline as the decay anchor.
      // This is always set at player creation and updated on each game end.
      // If somehow still null (legacy data), skip this player to avoid compounding decay.
      if (player.skillScoreBaseline === null || player.skillScoreBaseline === undefined) continue;
      const baseline = player.skillScoreBaseline;
      const totalDecay = calculateDecayPoints(daysInactive);
      if (totalDecay === 0) continue;
      const targetScore = Math.max(MIN_SKILL_SCORE, baseline - totalDecay);

      // Only update if the player's current score is above the target.
      // This makes the job idempotent — running again won't further reduce an already-decayed score.
      if (player.skillScore <= targetScore) continue;

      const newLevel = getSkillTierFromScore(targetScore);
      const tierChanged = newLevel !== player.level;

      await db
        .update(players)
        .set({ skillScore: targetScore, level: newLevel })
        .where(sql`${players.id} = ${player.id}`);

      console.log(
        `[Scheduler] Decay applied — ${player.name} (${player.shuttleIqId ?? player.id}): ` +
        `${player.skillScore} → ${targetScore} (${Math.round(daysInactive)}d inactive, baseline ${baseline}, -${baseline - targetScore}pts total)` +
        (tierChanged ? ` | tier: ${player.level} → ${newLevel}` : '')
      );
      decayCount++;
    }

    if (decayCount > 0) {
      console.log(`[Scheduler] Inactivity decay complete: ${decayCount} player(s) updated.`);
    }
  } catch (err) {
    console.error('[Scheduler] Inactivity decay job error:', err);
  }
}

/**
 * Startup migration: restores player skill scores from game history and
 * ensures every player has a valid skillScoreBaseline and lastPlayedAt.
 *
 * Why this exists:
 *   The inactivity decay feature added last_played_at and skill_score_baseline
 *   columns but the initial deploy had a bug — the decay job used created_at
 *   as a fallback for null last_played_at, causing all historical players
 *   (created months earlier) to be treated as maximally inactive and decayed
 *   to the score floor of 10.
 *
 * What this does (idempotent — safe to run on every startup):
 *   1. Score restoration: For any player whose current skill_score does NOT
 *      match the skill_score_after recorded in their most recent game
 *      (indicating wrongful decay), restore skill_score and
 *      skill_score_baseline to that last recorded game score, and recalculate
 *      the tier level. Players with no game history are unaffected.
 *   2. Baseline backfill: For any player still missing a skill_score_baseline,
 *      set it to their current skill_score.
 *   3. Clock initialisation: For any player still missing a last_played_at,
 *      set it to NOW() so their inactivity window starts from today.
 *      (Players who already have last_played_at set are left untouched — their
 *      timestamp was either restored or set correctly by a game-end event.)
 */
async function backfillSkillScoreBaseline(): Promise<void> {
  try {
    // Step 1: Restore scores, baselines, and tier levels from each player's
    // most recent game. Updates any player where skill_score, skill_score_baseline,
    // or level is out of sync with their last recorded game_participants entry.
    // Idempotent: after a normal game end, all three fields align with the
    // latest skill_score_after, so correct players produce 0 rows.
    const { rowCount: restoredCount } = await db.execute(sql`
      WITH last_game AS (
        SELECT DISTINCT ON (gp.player_id)
          gp.player_id,
          gp.skill_score_after AS restored_score,
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
        ORDER BY gp.player_id, gr.created_at DESC, gp.game_id DESC
      )
      UPDATE players p
      SET
        skill_score          = lg.restored_score,
        skill_score_baseline = lg.restored_score,
        level                = lg.restored_level
      FROM last_game lg
      WHERE p.id = lg.player_id
        AND (
          p.skill_score          != lg.restored_score
          OR p.skill_score_baseline != lg.restored_score
          OR p.level               != lg.restored_level
        )
    `);
    if ((restoredCount ?? 0) > 0) {
      console.log(`[Scheduler] Score restoration: corrected ${restoredCount} player(s) whose score/baseline/level had diverged from game history.`);
    }

    // Step 2: Backfill skillScoreBaseline for players with no game history
    // (players restored in step 1 already have the correct baseline).
    const baselineUpdated = await db
      .update(players)
      .set({ skillScoreBaseline: sql`${players.skillScore}` })
      .where(sql`${players.skillScoreBaseline} IS NULL`)
      .returning({ id: players.id });
    if (baselineUpdated.length > 0) {
      console.log(`[Scheduler] Backfilled skillScoreBaseline for ${baselineUpdated.length} player(s).`);
    }

    // Step 3: Ensure every player has a lastPlayedAt >= the fix deployment date.
    // This resets pre-fix timestamps (which were null or set by the buggy decay
    // job using created_at) to NOW(), giving everyone a clean 14-day window.
    // After the first corrective run, all timestamps will be post-fix so
    // subsequent startup runs will find 0 rows — making this idempotent.
    const FIX_DEPLOY_DATE = '2026-03-21 00:00:00+00';
    const clockUpdated = await db
      .update(players)
      .set({ lastPlayedAt: sql`NOW()` })
      .where(sql`${players.lastPlayedAt} IS NULL OR ${players.lastPlayedAt} < ${FIX_DEPLOY_DATE}::timestamptz`)
      .returning({ id: players.id });
    if (clockUpdated.length > 0) {
      console.log(`[Scheduler] Reset lastPlayedAt to now for ${clockUpdated.length} player(s) — inactivity clock starts today.`);
    }
  } catch (err) {
    console.error('[Scheduler] Startup backfill error:', err);
  }
}

/**
 * Expires pending_payment bookings (waitlist promotions) that exceed the 4-hour payment window.
 * For each expired booking:
 *   1. Cancels the booking
 *   2. Promotes the next eligible waitlisted user for that session (cascade)
 */
async function runExpiredPaymentJob(): Promise<void> {
  try {
    const expired = await storage.getExpiredPendingPaymentBookings(PAYMENT_WINDOW_MS);
    if (expired.length === 0) return;

    console.log(`[Scheduler] Expiring ${expired.length} pending_payment booking(s) that exceeded the 4-hour window...`);

    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';

    for (const booking of expired) {
      try {
        // Cancel the expired pending_payment booking permanently
        await storage.updateBooking(booking.id, { status: 'cancelled', cancelledAt: new Date() });

        // Notify the user their payment window expired
        await storage.createMarketplaceNotification({
          userId: booking.userId,
          type: 'payment_expired',
          title: 'Payment window expired',
          message: 'Your spot was released because payment was not completed within 4 hours. You can re-join the waitlist from the session page.',
          relatedBookingId: booking.id,
        });

        const bookableSession = await storage.getBookableSession(booking.sessionId);
        if (!bookableSession) continue;

        // Promote next eligible waitlisted user
        const waitlisted = await storage.getWaitlistedBookingsForSession(booking.sessionId);
        const currentCount = await storage.getBookingCountForSession(booking.sessionId);
        const spotsAvailable = bookableSession.capacity - currentCount;
        const next = waitlisted.find(w => (w.spotsBooked ?? 1) <= spotsAvailable);

        if (next) {
          const isZiinaPromotion = next.paymentMethod === 'ziina';
          const dateLabel = new Date(bookableSession.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

          if (isZiinaPromotion) {
            await storage.updateBooking(next.id, {
              status: 'pending_payment',
              waitlistPosition: null,
              promotedAt: new Date(),
            });
          } else {
            await storage.updateBooking(next.id, { status: 'confirmed', waitlistPosition: null });
            const slots = await storage.getBookingGuests(next.id);
            for (const slot of slots) {
              if (slot.status === 'pending') {
                await storage.updateBookingGuest(slot.id, { status: 'confirmed' });
              }
            }
          }

          await storage.createMarketplaceNotification({
            userId: next.userId,
            type: 'waitlist_promoted',
            title: isZiinaPromotion ? 'Spot available — complete payment!' : "You're confirmed!",
            message: isZiinaPromotion
              ? `A spot opened up for "${bookableSession.title}" on ${dateLabel} at ${bookableSession.venueName}. You have 4 hours to complete payment to secure your spot.`
              : `A spot opened up — you've been confirmed for "${bookableSession.title}" on ${dateLabel} at ${bookableSession.venueName}.`,
            relatedBookingId: next.id,
          });

          try {
            const nextUser = await storage.getMarketplaceUser(next.userId);
            if (nextUser) {
              const checkoutUrl = isZiinaPromotion ? `${baseUrl}/marketplace/my-bookings` : undefined;
              sendWaitlistPromotionEmail(nextUser.email, nextUser.name, bookableSession, checkoutUrl).catch(() => {});

              if (!isZiinaPromotion) {
                // Cash promotion: send guest confirmation emails and linked-user notifications
                const confirmedSlots = await storage.getBookingGuests(next.id);
                for (const slot of confirmedSlots) {
                  if (!slot.isPrimary && slot.status === 'confirmed') {
                    if (slot.email && slot.cancellationToken) {
                      const cancelGuestUrl = `${baseUrl}/marketplace/guests/cancel/${slot.cancellationToken}`;
                      const signupUrl = `${baseUrl}/marketplace/signup?email=${encodeURIComponent(slot.email)}`;
                      sendGuestBookingEmail(slot.email, slot.name, nextUser.name, bookableSession, cancelGuestUrl, signupUrl).catch(() => {});
                    }
                    if (slot.linkedUserId) {
                      await storage.createMarketplaceNotification({
                        userId: slot.linkedUserId,
                        type: 'guest_booking_confirmed',
                        title: 'You have a booking!',
                        message: `${nextUser.name} has been confirmed for "${bookableSession.title}" on ${dateLabel} — your guest spot is also confirmed.`,
                        relatedBookingId: next.id,
                      });
                    }
                  }
                }
              }
            }
          } catch (emailErr) {
            console.error('[Scheduler] Failed to send promotion email:', emailErr);
          }

          // Re-number remaining waitlisted bookings
          const remaining = (await storage.getWaitlistedBookingsForSession(booking.sessionId))
            .filter(w => w.id !== next.id);
          for (let i = 0; i < remaining.length; i++) {
            await storage.updateBooking(remaining[i].id, { waitlistPosition: i + 1 });
          }

          console.log(`[Scheduler] Promoted booking ${next.id} (${isZiinaPromotion ? 'pending_payment' : 'confirmed'}) for session ${booking.sessionId}`);
        }

        console.log(`[Scheduler] Expired pending_payment booking ${booking.id} — spot released and cascaded`);
      } catch (err) {
        console.error(`[Scheduler] Error expiring booking ${booking.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Expired payment job error:', err);
  }
}

// Every 15s, approve any match_suggestions whose pendingUntil has passed and
// notify the 4 assigned players. Per-suggestion failures are isolated.
async function runMatchSuggestionAutoApproveSweep(): Promise<void> {
  try {
    const activeSession = await storage.getActiveSession();
    if (!activeSession) {
      console.log('[auto-approve] no active session — skipping sweep');
      return;
    }

    const expired = await storage.listPastPendingMatchSuggestions(new Date());
    if (expired.length === 0) return;

    for (const suggestion of expired) {
      try {
        const court = await storage.getCourt(suggestion.courtId);
        if (!court) {
          console.warn(`[auto-approve] suggestion ${suggestion.id} skipped — court ${suggestion.courtId} not found`);
          continue;
        }
        if (court.status === 'occupied') {
          console.log(`[auto-approve] suggestion ${suggestion.id} skipped — court ${court.name} is occupied`);
          continue;
        }

        // Conditional update: if anything (admin Approve-now or Dismiss)
        // moved this suggestion out of 'pending' since we read it, the
        // update no-ops and we skip notifications.
        const approved = await storage.transitionPendingMatchSuggestion(suggestion.id, 'approved', 'auto');
        if (!approved) continue;

        const fresh = await storage.getMatchSuggestion(suggestion.id);
        if (!fresh) continue;

        console.log(`[auto-approve] suggestion ${suggestion.id} approved for court ${court.id}`);

        const playerRows = fresh.players;
        const playersById = new Map<string, string>();
        await Promise.all(playerRows.map(async (p) => {
          const player = await storage.getPlayer(p.playerId);
          if (player) playersById.set(player.id, player.name);
        }));

        let notifiedCount = 0;
        for (const p of playerRows) {
          try {
            const partnerRow = playerRows.find(x => x.team === p.team && x.playerId !== p.playerId);
            const opponents = playerRows.filter(x => x.team !== p.team);
            const partnerName = partnerRow ? playersById.get(partnerRow.playerId) ?? 'your partner' : 'your partner';
            const opponentNames = opponents.map(x => playersById.get(x.playerId)).filter(Boolean) as string[];
            const opponentLabel = opponentNames.length === 2 ? `${opponentNames[0]} + ${opponentNames[1]}` : opponentNames.join(' + ') || 'opponents';

            const marketplaceUser = await storage.getMarketplaceUserByLinkedPlayerId(p.playerId);
            if (!marketplaceUser) continue;

            await storage.createMarketplaceNotification({
              userId: marketplaceUser.id,
              type: 'court_ready',
              title: 'Your court is ready',
              message: `Court ${court.name} — ${partnerName} vs ${opponentLabel}. Head to your court now.`,
            });
            notifiedCount++;
          } catch (notifyErr) {
            console.error(`[auto-approve] notify failed for player ${p.playerId}:`, notifyErr);
          }
        }

        console.log(`[auto-approve] suggestion ${suggestion.id} sent ${notifiedCount}/${playerRows.length} notifications`);
      } catch (innerErr) {
        console.error(`[auto-approve] suggestion ${suggestion.id} failed:`, innerErr);
      }
    }
  } catch (err) {
    console.error('[auto-approve] sweep error:', err);
  }
}

async function runResumeTokenCleanupJob(): Promise<void> {
  try {
    const removed = await storage.deleteExpiredPaymentResumeTokens();
    console.log(`[Scheduler] Payment resume token cleanup: removed ${removed} expired/used token(s).`);
  } catch (err) {
    console.error('[Scheduler] Payment resume token cleanup error:', err);
  }
}

export function startScheduler(): void {
  console.log('[Scheduler] Session reminder scheduler started (runs every 30 min)');
  setInterval(runReminderJob, REMINDER_INTERVAL_MS);
  runReminderJob();

  console.log('[Scheduler] Waitlist payment expiry scheduler started (runs every 30 min)');
  setInterval(runExpiredPaymentJob, REMINDER_INTERVAL_MS);
  runExpiredPaymentJob();

  console.log('[Scheduler] Inactivity decay scheduler started (runs every 24 h)');
  // Backfill first, then run the decay job (backfill is fast and idempotent)
  backfillSkillScoreBaseline().then(() => {
    runInactivityDecayJob();
  });
  setInterval(runInactivityDecayJob, DECAY_INTERVAL_MS);

  console.log('[Scheduler] Payment resume token cleanup scheduler started (runs every 1 h)');
  setInterval(runResumeTokenCleanupJob, RESUME_TOKEN_CLEANUP_INTERVAL_MS);
  runResumeTokenCleanupJob();

  console.log('[Scheduler] Match suggestion auto-approve sweep started (runs every 15 s)');
  setInterval(runMatchSuggestionAutoApproveSweep, AUTO_APPROVE_SWEEP_INTERVAL_MS);
  runMatchSuggestionAutoApproveSweep();
}
