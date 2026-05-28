import { db } from '../server/db';
import { players, marketplaceUsers } from '../shared/schema';
import { eq } from 'drizzle-orm';

const KEEP_ID   = '3a34ca92-5a93-4a27-a7b0-01c36243be69'; // SIQ-00322 — real game data
const DELETE_ID = '313bbd24-5e08-4b16-8a14-6173df3a6dd6'; // SIQ-00326 — empty duplicate
const MP_USER_ID = 'a2ec3ec3-cf68-433d-b89c-76f86d8dca1d'; // kusishil@gmail.com

async function run() {
  console.log('--- Merge SIQ-00326 → SIQ-00322 ---\n');

  // 1. Verify current state
  const [keep]   = await db.select().from(players).where(eq(players.id, KEEP_ID));
  const [remove] = await db.select().from(players).where(eq(players.id, DELETE_ID));
  const [mpUser] = await db.select().from(marketplaceUsers).where(eq(marketplaceUsers.id, MP_USER_ID));

  console.log('KEEP   (SIQ-00322):', keep?.name, '| games:', keep?.gamesPlayed, '| score:', keep?.skillScore, '| email:', keep?.email);
  console.log('DELETE (SIQ-00326):', remove?.name, '| games:', remove?.gamesPlayed, '| score:', remove?.skillScore, '| email:', remove?.email);
  console.log('MP user linked to :', mpUser?.linkedPlayerId);
  console.log('');

  if (!keep)   { console.error('SIQ-00322 not found — aborting'); process.exit(1); }
  if (!remove) { console.error('SIQ-00326 not found — aborting'); process.exit(1); }
  if (remove.gamesPlayed > 0) { console.error('SIQ-00326 has game data — aborting'); process.exit(1); }

  // 2. Copy name + contact from duplicate onto the real record
  const [updated] = await db
    .update(players)
    .set({
      name:  'SISHIL IMMO',
      email: 'kusishil@gmail.com',
      phone: '+971523316397',
    })
    .where(eq(players.id, KEEP_ID))
    .returning();
  console.log('Step 1 — updated SIQ-00322:', updated.name, updated.email, updated.phone);

  // 3. Re-link marketplace account to SIQ-00322
  const [updatedMp] = await db
    .update(marketplaceUsers)
    .set({ linkedPlayerId: KEEP_ID })
    .where(eq(marketplaceUsers.id, MP_USER_ID))
    .returning();
  console.log('Step 2 — marketplace user now linked to:', updatedMp.linkedPlayerId);

  // 4. Delete SIQ-00326 (no game_participants / queue / referrals — verified above)
  const deleted = await db
    .delete(players)
    .where(eq(players.id, DELETE_ID))
    .returning();
  console.log('Step 3 — deleted SIQ-00326:', deleted.length === 1 ? 'OK' : 'NOT FOUND');

  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
