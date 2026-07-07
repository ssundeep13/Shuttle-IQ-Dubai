import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Court bands Gate 2 — band membership on the CONFIRMED tier (players.level),
// including the legacy 'Intermediate'/'Competitive' aliases. Bands constrain
// suggestion/orchestrator pools only; captain actions are never gated.

const LEVELS = {
  novice: 'Novice',
  beginner: 'Beginner',
  lowerInt: 'lower_intermediate',
  legacyInt: 'Intermediate',       // legacy alias of lower_intermediate
  upperInt: 'upper_intermediate',
  legacyComp: 'Competitive',       // legacy alias of upper_intermediate
  advanced: 'Advanced',
  pro: 'Professional',
};

describe('playerPassesBand — the band × confirmed-tier matrix', () => {
  it('all_levels admits every tier (and unknown levels default in)', async () => {
    const { playerPassesBand } = await import('../server/matchmaking');
    for (const level of Object.values(LEVELS)) {
      expect(playerPassesBand('all_levels', level)).toBe(true);
    }
    expect(playerPassesBand('all_levels', 'garbage')).toBe(true);
  });

  it('beginner = Novice + Beginner only', async () => {
    const { playerPassesBand } = await import('../server/matchmaking');
    expect(playerPassesBand('beginner', LEVELS.novice)).toBe(true);
    expect(playerPassesBand('beginner', LEVELS.beginner)).toBe(true);
    expect(playerPassesBand('beginner', LEVELS.lowerInt)).toBe(false);
    expect(playerPassesBand('beginner', LEVELS.legacyInt)).toBe(false);
    expect(playerPassesBand('beginner', LEVELS.advanced)).toBe(false);
    expect(playerPassesBand('beginner', LEVELS.pro)).toBe(false);
  });

  it('intermediate_plus = lower_intermediate and up (legacy alias included)', async () => {
    const { playerPassesBand } = await import('../server/matchmaking');
    expect(playerPassesBand('intermediate_plus', LEVELS.novice)).toBe(false);
    expect(playerPassesBand('intermediate_plus', LEVELS.beginner)).toBe(false);
    expect(playerPassesBand('intermediate_plus', LEVELS.lowerInt)).toBe(true);
    expect(playerPassesBand('intermediate_plus', LEVELS.legacyInt)).toBe(true);
    expect(playerPassesBand('intermediate_plus', LEVELS.upperInt)).toBe(true);
    expect(playerPassesBand('intermediate_plus', LEVELS.advanced)).toBe(true);
    expect(playerPassesBand('intermediate_plus', LEVELS.pro)).toBe(true);
  });

  it('competitive_plus = upper_intermediate, Advanced, Professional (legacy alias included)', async () => {
    const { playerPassesBand } = await import('../server/matchmaking');
    expect(playerPassesBand('competitive_plus', LEVELS.lowerInt)).toBe(false);
    expect(playerPassesBand('competitive_plus', LEVELS.legacyInt)).toBe(false);
    expect(playerPassesBand('competitive_plus', LEVELS.upperInt)).toBe(true);
    expect(playerPassesBand('competitive_plus', LEVELS.legacyComp)).toBe(true);
    expect(playerPassesBand('competitive_plus', LEVELS.advanced)).toBe(true);
    expect(playerPassesBand('competitive_plus', LEVELS.pro)).toBe(true);
  });

  it('unknown band string never restricts (fails open, matching all_levels)', async () => {
    const { playerPassesBand } = await import('../server/matchmaking');
    expect(playerPassesBand('mystery_band', LEVELS.novice)).toBe(true);
    expect(playerPassesBand('mystery_band', LEVELS.pro)).toBe(true);
  });
});

describe('bandDistance — nearest-tier ranking for relax_band', () => {
  it('in-band players are distance 0; outsiders rank by tier distance', async () => {
    const { bandDistance } = await import('../server/matchmaking');
    expect(bandDistance('competitive_plus', LEVELS.pro)).toBe(0);
    expect(bandDistance('competitive_plus', LEVELS.lowerInt)).toBe(1);
    expect(bandDistance('competitive_plus', LEVELS.beginner)).toBe(2);
    expect(bandDistance('competitive_plus', LEVELS.novice)).toBe(3);
    expect(bandDistance('beginner', LEVELS.lowerInt)).toBe(1);
    expect(bandDistance('beginner', LEVELS.pro)).toBe(4);
    expect(bandDistance('all_levels', LEVELS.novice)).toBe(0);
  });
});
