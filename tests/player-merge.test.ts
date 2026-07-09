import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Gate M1 — the merge transaction's invariants are locked here as source
// tripwires; behavior is proven live by the sandbox scenario suite
// (scripts/scratch, scenarios a-h).

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('player merge - transaction invariants', () => {
  const src = read('server/playerMerge.ts');

  it('merge log is written BEFORE any history is re-pointed', () => {
    const logInsert = src.indexOf('.insert(playerMergeLog)');
    const firstRepoint = src.indexOf('.update(gameParticipants)');
    expect(logInsert, 'merge-log insert not found').toBeGreaterThan(-1);
    expect(firstRepoint, 'game_participants re-point not found').toBeGreaterThan(-1);
    expect(logInsert, 'log must be written before re-pointing starts').toBeLessThan(firstRepoint);
  });

  it('wallet moves are new adjustment entries — existing ledger rows are never updated or deleted', () => {
    expect(src.includes('.insert(walletTransactions)')).toBe(true);
    expect(src.includes('.update(walletTransactions)'), 'ledger row UPDATE is forbidden').toBe(false);
    expect(src.includes('.delete(walletTransactions)'), 'ledger row DELETE is forbidden').toBe(false);
    expect(src.includes('type: "adjustment"')).toBe(true);
  });

  it('all named refusals exist', () => {
    for (const code of ['SAME_PLAYER', 'PLAYER_IN_SESSION', 'GAME_COLLISION', 'BOTH_LINKED', 'ALREADY_UNDONE', 'WALLET_MOVE_FAILED', 'ABSORBED_ID_TAKEN']) {
      expect(src.includes(`"${code}"`), `missing named error ${code}`).toBe(true);
    }
  });

  it('undo refuses an already-undone merge before touching anything', () => {
    const undoneCheck = src.indexOf('ALREADY_UNDONE');
    const reinsert = src.indexOf('.insert(players)');
    expect(undoneCheck).toBeGreaterThan(-1);
    expect(reinsert).toBeGreaterThan(-1);
    expect(undoneCheck, 'status check must precede the re-insert').toBeLessThan(reinsert);
  });

  it('recompute follows the recalculate primitive: counts + latest after-score, never an average', () => {
    expect(src.includes('winning_team = gp.team')).toBe(true);
    expect(src.includes('skill_score_after')).toBe(true);
    expect(src.includes('ORDER BY gr.created_at DESC')).toBe(true);
    expect(/AVG\s*\(/i.test(src), 'averaging ratings is forbidden').toBe(false);
  });

  it('both advisory locks are taken in deterministic order', () => {
    expect(src.includes('.sort()')).toBe(true);
    expect(src.includes('pg_advisory_xact_lock')).toBe(true);
  });
});

describe('player merge - routes and migration', () => {
  it('all four merge endpoints are admin-gated', () => {
    const src = read('server/routes.ts');
    for (const route of [
      '"/api/admin/players/merge-preview"',
      '"/api/admin/players/:survivorId/merge/:absorbedId"',
      '"/api/admin/player-merges/:logId/undo"',
      '"/api/admin/player-merges"',
    ]) {
      const at = src.indexOf(route);
      expect(at, `${route} not found`).toBeGreaterThan(-1);
      const line = src.slice(at, src.indexOf('\n', at) + 200);
      expect(line.includes('requireAuth'), `${route} missing requireAuth`).toBe(true);
      expect(line.includes('requireAdmin'), `${route} missing requireAdmin`).toBe(true);
    }
  });

  it('migration is additive only', () => {
    const src = read('scripts/migrate-merge-log.mjs');
    expect(src.includes('CREATE TABLE IF NOT EXISTS player_merge_log')).toBe(true);
    expect(/ALTER TABLE|DROP TABLE|DROP COLUMN/i.test(src)).toBe(false);
  });

  it('schema declares player_merge_log with undo bookkeeping', () => {
    const src = read('shared/schema.ts');
    expect(src.includes('player_merge_log')).toBe(true);
    for (const col of ['absorbed_snapshot', 'repointed', 'restore_rows', 'wallet_debit_tx_id', 'undone_at']) {
      expect(src.includes(col), `missing column ${col}`).toBe(true);
    }
  });
});
