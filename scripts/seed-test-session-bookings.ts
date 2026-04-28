// One-shot seed: book the 6 demo test marketplace accounts
// (Male Test 3-4, Female Test 1-4) into the next upcoming bookable session
// so they can exercise the /marketplace/dashboard check-in banner and the
// /marketplace/play check-in flow.
//
// Booking shape mirrors the admin booking endpoint
// (POST /api/marketplace/admin/bookings):
//   status              = 'confirmed'
//   payment_method      = 'cash'
//   cash_paid           = false
//   ziina_payment_intent_id = null
//   amount_aed          = bookableSession.priceAed
//   wallet_amount_used  = 0 (default)
//
// Run:
//   tsx scripts/seed-test-session-bookings.ts                    # auto-pick next upcoming
//   tsx scripts/seed-test-session-bookings.ts <bookableSessionId> # explicit session
//
// Idempotent: if a test account already has a non-cancelled booking on the
// chosen session, it is skipped.
//
// REMINDER FOR THE OPERATOR: the /marketplace/play screen ALSO requires the
// linked admin session to be in status='active' (not 'upcoming') before it
// will unlock. After running this script, an admin must mark the matching
// admin session as active via the admin tools. The /marketplace/dashboard
// check-in banner does NOT require activation and will show as soon as the
// booking exists.

import { db } from "../server/db";
import { storage } from "../server/storage";
import { bookableSessions, bookings, marketplaceUsers } from "@shared/schema";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";

const TEST_ACCOUNT_EMAILS = [
  "maletest3@demo.siq",
  "maletest4@demo.siq",
  "femaletest1@demo.siq",
  "femaletest2@demo.siq",
  "femaletest3@demo.siq",
  "femaletest4@demo.siq",
];

async function pickBookableSessionId(explicitId: string | undefined): Promise<string> {
  if (explicitId) {
    const existing = await db
      .select({ id: bookableSessions.id })
      .from(bookableSessions)
      .where(eq(bookableSessions.id, explicitId))
      .limit(1);
    if (!existing.length) {
      throw new Error(`No bookable session with id ${explicitId}`);
    }
    return explicitId;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [next] = await db
    .select({ id: bookableSessions.id })
    .from(bookableSessions)
    .where(
      and(
        eq(bookableSessions.status, "upcoming"),
        gte(bookableSessions.date, startOfToday),
      ),
    )
    .orderBy(asc(bookableSessions.date))
    .limit(1);

  if (!next) {
    throw new Error(
      "No upcoming bookable session found (status='upcoming', date >= today). " +
        "Create one via the admin Sessions page or pass an explicit session id as a CLI arg.",
    );
  }
  return next.id;
}

async function main() {
  const explicitId = process.argv[2];
  const sessionId = await pickBookableSessionId(explicitId);

  const session = await storage.getBookableSessionWithAvailability(sessionId);
  if (!session) {
    throw new Error(`Bookable session ${sessionId} disappeared between lookups.`);
  }

  console.log(
    `[seed-bookings] Target session: ${session.id} — "${session.title}" @ ${session.venueName}`,
  );
  console.log(
    `[seed-bookings]   date=${new Date(session.date).toISOString().slice(0, 10)} ${session.startTime}-${session.endTime} priceAed=${session.priceAed} spotsRemaining=${session.spotsRemaining}`,
  );
  if (session.linkedSessionId) {
    console.log(`[seed-bookings]   linkedSessionId=${session.linkedSessionId}`);
  } else {
    console.log(
      `[seed-bookings]   WARNING: this bookable session has no linkedSessionId — the Play page will not match it even after booking.`,
    );
  }

  const users = await db
    .select({
      id: marketplaceUsers.id,
      email: marketplaceUsers.email,
      name: marketplaceUsers.name,
    })
    .from(marketplaceUsers)
    .where(inArray(marketplaceUsers.email, TEST_ACCOUNT_EMAILS));

  const usersByEmail = new Map(users.map((u) => [u.email, u]));

  console.log(`\n[seed-bookings] Found ${users.length}/${TEST_ACCOUNT_EMAILS.length} test accounts in marketplace_users.`);

  let created = 0;
  let skipped = 0;
  let missing = 0;

  for (const email of TEST_ACCOUNT_EMAILS) {
    const user = usersByEmail.get(email);
    process.stdout.write(`[seed-bookings] ${email} … `);
    if (!user) {
      console.log("MISSING from marketplace_users — skip");
      missing++;
      continue;
    }

    const existing = await storage.getUserBookingForSession(user.id, sessionId);
    if (existing && existing.status !== "cancelled") {
      console.log(`already booked (status=${existing.status}) — skip`);
      skipped++;
      continue;
    }

    const fresh = await storage.getBookableSessionWithAvailability(sessionId);
    if (!fresh || fresh.spotsRemaining <= 0) {
      console.log("session is full — skip");
      skipped++;
      continue;
    }

    await storage.createBooking({
      userId: user.id,
      sessionId,
      status: "confirmed",
      paymentMethod: "cash",
      ziinaPaymentIntentId: null,
      amountAed: fresh.priceAed,
      cashPaid: false,
    });
    console.log("booked");
    created++;
  }

  console.log(
    `\n[seed-bookings] Done attempting. created=${created} skipped=${skipped} missing=${missing}`,
  );

  // Final assertion: every one of the 6 test accounts must have an active
  // (non-cancelled) booking on the targeted session. Anything less means
  // Task #39's success criteria are not met (e.g. Female Test 2's Dashboard
  // banner won't appear), so exit non-zero so the operator notices.
  const userIds = users.map((u) => u.id);
  const activeBookings = userIds.length
    ? await db
        .select({ userId: bookings.userId })
        .from(bookings)
        .where(
          and(
            eq(bookings.sessionId, sessionId),
            inArray(bookings.userId, userIds),
            ne(bookings.status, "cancelled"),
          ),
        )
    : [];
  const bookedUserIds = new Set(activeBookings.map((b) => b.userId));
  const unbookedEmails = TEST_ACCOUNT_EMAILS.filter((email) => {
    const u = usersByEmail.get(email);
    return !u || !bookedUserIds.has(u.id);
  });

  if (unbookedEmails.length > 0) {
    console.error(
      `\n[seed-bookings] FAILED: ${unbookedEmails.length}/${TEST_ACCOUNT_EMAILS.length} test accounts still lack an active booking on session ${sessionId}: ${unbookedEmails.join(", ")}`,
    );
    process.exit(2);
  }

  console.log(
    `\n[seed-bookings] OK: all ${TEST_ACCOUNT_EMAILS.length} test accounts have an active booking on session ${sessionId}.`,
  );
  if (session.linkedSessionId) {
    console.log(
      `[seed-bookings] Reminder: the Play page also requires the linked admin session (${session.linkedSessionId}) to be status='active'. The Dashboard banner does NOT.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-bookings] FATAL:", err);
    process.exit(1);
  });
