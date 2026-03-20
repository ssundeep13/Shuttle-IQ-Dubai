import { storage } from "./storage";
import { sendSessionReminderEmail } from "./emailClient";
import { db } from "./db";
import { players } from "@shared/schema";
import { sql } from "drizzle-orm";

const REMINDER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DECAY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

const MIN_SKILL_SCORE = 10;
const INACTIVITY_THRESHOLD_DAYS = 14;
const DECAY_POINTS_PER_WEEK = 5;

function getSkillTierFromScore(score: number): string {
  if (score < 40) return 'Novice';
  if (score < 70) return 'Beginner';
  if (score < 110) return 'Intermediate';
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
 * Inactivity decay rule:
 *   - 14+ days inactive: -5 pts from skillScoreBaseline (the score at last game)
 *   - 21+ days: -10 pts from baseline
 *   - 28+ days: -15 pts from baseline
 *   - etc. (weeksOverThreshold × 5 pts, always relative to baseline)
 *
 * Using skillScoreBaseline as the anchor makes this idempotent — each daily
 * run computes the same target score for a given inactivity duration, so running
 * multiple times per day has no extra effect.
 */
async function runInactivityDecayJob(): Promise<void> {
  try {
    const now = new Date();
    // Inclusive: players inactive for >= 14 days (use strictly-less-than threshold date)
    const thresholdDate = new Date(now.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    // Fetch players where lastPlayedAt >= 14 days ago,
    // OR lastPlayedAt is null and createdAt >= 14 days ago (never played).
    const inactivePlayers = await db
      .select()
      .from(players)
      .where(
        sql`(${players.lastPlayedAt} IS NOT NULL AND ${players.lastPlayedAt} <= ${thresholdDate})
            OR (${players.lastPlayedAt} IS NULL AND ${players.createdAt} <= ${thresholdDate})`
      );

    if (inactivePlayers.length === 0) return;

    console.log(`[Scheduler] Inactivity decay: checking ${inactivePlayers.length} inactive player(s)...`);

    let decayCount = 0;
    for (const player of inactivePlayers) {
      const referenceDate = player.lastPlayedAt ?? player.createdAt;
      const msInactive = now.getTime() - referenceDate.getTime();
      const daysInactive = msInactive / (24 * 60 * 60 * 1000);

      // Full weeks beyond the 14-day mark:
      //   14 days → weeksOver = 1 → -5 pts
      //   21 days → weeksOver = 2 → -10 pts
      //   28 days → weeksOver = 3 → -15 pts
      const weeksOverThreshold = Math.floor((daysInactive - INACTIVITY_THRESHOLD_DAYS) / 7) + 1;
      if (weeksOverThreshold < 1) continue;

      // Baseline is the score the player had at their last game (or their current score
      // if they never played — skillScoreBaseline is null for players who've never played).
      // For players who never played, use their current skillScore as the baseline.
      const baseline = player.skillScoreBaseline ?? player.skillScore;
      const totalDecay = weeksOverThreshold * DECAY_POINTS_PER_WEEK;
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

export function startScheduler(): void {
  console.log('[Scheduler] Session reminder scheduler started (runs every 30 min)');
  setInterval(runReminderJob, REMINDER_INTERVAL_MS);
  runReminderJob();

  console.log('[Scheduler] Inactivity decay scheduler started (runs every 24 h)');
  setInterval(runInactivityDecayJob, DECAY_INTERVAL_MS);
  runInactivityDecayJob();
}
