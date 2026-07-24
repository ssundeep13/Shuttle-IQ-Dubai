#!/usr/bin/env node
// Gate R2 — pinned native release build path.
//
// The native (Capacitor) bundle bakes VITE_API_BASE at build time; a release
// build MUST bake https://shuttleiq.ai or every API call in the shipped app
// fails against capacitor://localhost. This wrapper:
//   1. Pins VITE_API_BASE to the production origin — and REFUSES to run if
//      the environment already carries a different value (a stale staging
//      URL in a shell must fail loudly, never be silently overridden).
//   2. Builds the web client (dist/public — Capacitor's webDir).
//   3. PROVES the baked bundle contains the production origin before any
//      sync happens — grep of the emitted JS, not assumption.
//   4. Runs `npx cap sync android`.
// Dependency-free and cross-platform (Windows PowerShell included):
//   npm run build:native:release
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RELEASE_API_BASE = 'https://shuttleiq.ai';

const existing = process.env.VITE_API_BASE;
if (existing !== undefined && existing !== RELEASE_API_BASE) {
  console.error(
    `[native-release] REFUSING to build: VITE_API_BASE is already set to "${existing}".\n` +
    `[native-release] Release builds must bake ${RELEASE_API_BASE}. Unset the variable and rerun — ` +
    `this script pins the correct value itself and never overrides a conflicting one.`,
  );
  process.exit(1);
}
process.env.VITE_API_BASE = RELEASE_API_BASE;
console.log(`[native-release] VITE_API_BASE pinned to ${RELEASE_API_BASE}`);

function run(cmd, args) {
  console.log(`[native-release] > ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`[native-release] FAILED: ${cmd} ${args.join(' ')} (exit ${r.status ?? 'signal'})`);
    process.exit(r.status ?? 1);
  }
}

run('npx', ['vite', 'build']);

// ── Bundle proof: the built output must actually contain the origin ──────
const dist = join('dist', 'public');
if (!existsSync(join(dist, 'index.html'))) {
  console.error(`[native-release] FAILED: ${dist}/index.html not found after build.`);
  process.exit(1);
}
const assetsDir = join(dist, 'assets');
const jsFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')) : [];
let totalHits = 0;
const matched = [];
for (const f of jsFiles) {
  const hits = readFileSync(join(assetsDir, f), 'utf8').split(RELEASE_API_BASE).length - 1;
  if (hits > 0) {
    totalHits += hits;
    matched.push(`${f} (${hits})`);
  }
}
if (totalHits === 0) {
  console.error(
    `[native-release] FAILED: no emitted JS bundle in ${assetsDir} contains ${RELEASE_API_BASE}.\n` +
    `[native-release] The API base was NOT baked — refusing to cap sync an app that cannot reach the backend.`,
  );
  process.exit(1);
}
console.log(`[native-release] bundle proof OK: ${RELEASE_API_BASE} baked into ${matched.join(', ')} — ${totalHits} occurrence(s)`);

run('npx', ['cap', 'sync', 'android']);
console.log('[native-release] DONE — web built with pinned API base, verified, and synced to android/');
