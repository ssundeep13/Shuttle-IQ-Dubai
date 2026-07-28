// Founding Member reconciliation pass (Silicon Oasis launch week).
//
// The award is a LIVE hook now — this script is the backfill for players who
// already qualified before the hook existed, and the reconciler for any path
// that changes a booking without going through a hooked route (an admin
// cancelling a whole event, a direct DB fix).
//
//   npx tsx scripts/award-founding-members.mts            # dry run, writes nothing
//   npx tsx scripts/award-founding-members.mts --execute  # award + revoke
//
// Idempotent: re-run as often as you like until the seal — the composite
// primary key means existing awards are never duplicated or re-dated, and
// seen_at is never cleared. After the seal it refuses to write at all.
import { awardFoundingMembers, QUALIFYING_STATUSES, SEAL_TIME } from '../server/venueAwards';

const EXECUTE = process.argv.includes('--execute');

const r = await awardFoundingMembers({ execute: EXECUTE });

console.log(`\nFounding Member — venue ${r.venueId} (Rochester Institute of Technology, Dubai Silicon Oasis)`);
console.log(`Sessions (${r.sessionIds.length}): ${r.sessionIds.join(', ')}`);
console.log(`Qualifying statuses counted: ${QUALIFYING_STATUSES.join(', ')}`);
console.log(`Seal: ${SEAL_TIME.toISOString()} (2026-07-31 23:59 Asia/Dubai) — ${r.beforeSeal ? 'OPEN' : 'SEALED, no writes'}\n`);

console.log(`ELIGIBLE (${r.eligible.length}):`);
for (const e of r.eligible) {
  console.log(`  ${e.name.padEnd(28)} ${e.userId}  sessions=${e.sessions}${e.linkedPlayerId ? '' : '  [NO LINKED PLAYER]'}`);
}

console.log(`\nEXCLUDED by the current policy:`);
console.log(`  waitlisted only ......... ${r.excluded.waitlistedOnly}`);
console.log(`  pending (unpaid) only ... ${r.excluded.pendingOnly}`);
console.log(`  hold (pending_payment) only ... ${r.excluded.holdOnly}`);
console.log(`  cancelled only .......... ${r.excluded.cancelledOnly}`);
console.log(`  linked guests, no own booking ... ${r.excluded.linkedGuestsNotBooked}`);

console.log(`\nAwards already held: ${r.alreadyHeld}`);
if (r.staleHolders.length > 0) {
  console.log(`STALE holders (award row, but zero qualifying bookings now): ${r.staleHolders.length}`);
  for (const id of r.staleHolders) console.log(`  ${id}`);
}
if (r.executed) {
  console.log(`WROTE ${r.inserted.length} new award(s); ${r.eligible.length - r.inserted.length} already had a row.`);
  console.log(`REINSTATED ${r.reinstated.length} soft-revoked award(s) (seen_at untouched).`);
  console.log(`REVOKED ${r.revoked.length} stale award(s) — soft, revoked_at stamped.`);
} else {
  console.log(`DRY RUN — nothing written. Would write ${Math.max(0, r.eligible.length - r.alreadyHeld)} new award(s) and revoke ${r.staleHolders.length}.`);
  console.log('Re-run with --execute to reconcile.');
}
process.exit(0);
