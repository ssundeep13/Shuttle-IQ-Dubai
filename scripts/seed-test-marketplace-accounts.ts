// One-shot seed for 6 test marketplace accounts (Male Test 3-4, Female Test 1-4).
// Uses the same atomic helper that the live signup endpoint uses
// (storage.signupMarketplaceUserWithPlayer) so SIQ ID allocation, referral
// code formatting, and the marketplace_users -> players linkage all match
// production behavior exactly.
//
// Run:
//   tsx scripts/seed-test-marketplace-accounts.ts
//
// Idempotent: skips any email already present in marketplace_users.

import { db } from "../server/db";
import { storage } from "../server/storage";
import { hashPassword } from "../server/auth/utils";
import { marketplaceUsers, players } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

type Spec = {
  name: string;
  email: string;
  phone: string;
  gender: "Male" | "Female";
  skillScore: number;
  level: string;
};

const SPECS: Spec[] = [
  { name: "Male Test 3",   email: "maletest3@demo.siq",   phone: "+971501111003", gender: "Male",   skillScore: 55, level: "beginner" },
  { name: "Male Test 4",   email: "maletest4@demo.siq",   phone: "+971501111004", gender: "Male",   skillScore: 75, level: "lower_intermediate" },
  { name: "Female Test 1", email: "femaletest1@demo.siq", phone: "+971501111005", gender: "Female", skillScore: 95, level: "upper_intermediate" },
  { name: "Female Test 2", email: "femaletest2@demo.siq", phone: "+971501111006", gender: "Female", skillScore: 55, level: "beginner" },
  { name: "Female Test 3", email: "femaletest3@demo.siq", phone: "+971501111007", gender: "Female", skillScore: 75, level: "lower_intermediate" },
  { name: "Female Test 4", email: "femaletest4@demo.siq", phone: "+971501111008", gender: "Female", skillScore: 55, level: "beginner" },
];

const ALL_EIGHT_EMAILS = [
  "maletest1@demo.siq",
  "maletest2@demo.siq",
  ...SPECS.map((s) => s.email),
];

async function ensureVerified(email: string): Promise<void> {
  // Idempotent terminal-state enforcement: even when an email already exists
  // we (re-)apply email_verified=true and clear any pending verification
  // token. Cheap, safe, and repairs partial earlier runs.
  await db
    .update(marketplaceUsers)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
    })
    .where(eq(marketplaceUsers.email, email));
}

async function seedOne(spec: Spec, passwordHash: string): Promise<{ status: "created" | "skipped"; reason?: string }> {
  const existing = await storage.getMarketplaceUserByEmail(spec.email);
  if (existing) {
    await ensureVerified(spec.email);
    return { status: "skipped", reason: "already exists (verified state re-applied)" };
  }

  await storage.signupMarketplaceUserWithPlayer({
    userInsert: {
      email: spec.email,
      passwordHash,
      name: spec.name,
      phone: spec.phone,
      linkedPlayerId: null,
      role: "player",
      pendingSignupCreditFils: 0,
      emailVerified: false,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
    },
    playerInsert: {
      name: spec.name,
      email: spec.email,
      phone: spec.phone,
      gender: spec.gender,
      level: spec.level,
      skillScore: spec.skillScore,
    },
  });

  // Skip the verification flow for seeded accounts.
  await db
    .update(marketplaceUsers)
    .set({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
    })
    .where(eq(marketplaceUsers.email, spec.email));

  return { status: "created" };
}

async function printReport() {
  const users = await db
    .select({
      id: marketplaceUsers.id,
      email: marketplaceUsers.email,
      name: marketplaceUsers.name,
      linkedPlayerId: marketplaceUsers.linkedPlayerId,
      emailVerified: marketplaceUsers.emailVerified,
    })
    .from(marketplaceUsers)
    .where(inArray(marketplaceUsers.email, ALL_EIGHT_EMAILS));

  const playerIds = users.map((u) => u.linkedPlayerId).filter((id): id is string => !!id);
  const playerRows = playerIds.length
    ? await db
        .select({
          id: players.id,
          shuttleIqId: players.shuttleIqId,
          gender: players.gender,
          level: players.level,
          skillScore: players.skillScore,
          referralCode: players.referralCode,
        })
        .from(players)
        .where(inArray(players.id, playerIds))
    : [];
  const playerById = new Map(playerRows.map((p) => [p.id, p]));

  // Sort by the spec order so output is deterministic.
  const order = ALL_EIGHT_EMAILS;
  users.sort((a, b) => order.indexOf(a.email) - order.indexOf(b.email));

  console.log("\n=== All 8 test accounts ===\n");
  console.log("| Name | Email | Skill Score | Tier (level) | shuttleIqId | email_verified | linkedPlayerId set |");
  console.log("|------|-------|-------------|--------------|-------------|----------------|--------------------|");
  for (const u of users) {
    const p = u.linkedPlayerId ? playerById.get(u.linkedPlayerId) : undefined;
    console.log(
      `| ${u.name} | ${u.email} | ${p?.skillScore ?? "—"} | ${p?.level ?? "—"} | ${p?.shuttleIqId ?? "—"} | ${u.emailVerified} | ${u.linkedPlayerId ? "yes" : "no"} |`,
    );
  }

  if (users.length !== ALL_EIGHT_EMAILS.length) {
    const found = new Set(users.map((u) => u.email));
    const missing = ALL_EIGHT_EMAILS.filter((e) => !found.has(e));
    console.log(`\nNOTE: ${missing.length} expected email(s) not present in this DB: ${missing.join(", ")}`);
  }
}

async function main() {
  console.log("[seed] Hashing password Test1234! with bcrypt (rounds=10)…");
  const passwordHash = await hashPassword("Test1234!");
  console.log(`[seed] hash: ${passwordHash}`);
  console.log(`[seed] hash length: ${passwordHash.length} (expected 60)`);

  for (const spec of SPECS) {
    process.stdout.write(`[seed] ${spec.name} (${spec.email}) … `);
    try {
      const result = await seedOne(spec, passwordHash);
      if (result.status === "created") {
        console.log("created");
      } else {
        console.log(`skipped — ${result.reason}`);
      }
    } catch (err: any) {
      console.log(`FAILED: ${err?.message ?? err}`);
      throw err;
    }
  }

  await printReport();
  console.log("\n[seed] Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] FATAL:", err);
    process.exit(1);
  });
