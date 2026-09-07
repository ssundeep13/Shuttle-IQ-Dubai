import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// DO NOT `drizzle-kit push` against production: drizzle-kit 0.31.4 mis-reads PG18 named NOT NULL/CHECK constraints and plans to drop them (327 statements on 2026-09-05). See docs/challenges-build-report.md; use scripts/one-shot/*.mts.
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
