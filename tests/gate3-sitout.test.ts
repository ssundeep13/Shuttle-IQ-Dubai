import { describe, it, expect } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-main-secret';
process.env.PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET || 'test-portal-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/dummy';

// Gate 3 — sit-out fairness. Voluntary sit-out is a pure toggle: the flag
// holds until explicitly toggled back, gamesWaited (the queue-fairness
// counter) is frozen for the entire sit-out, and fatigue decay is driven by
// roundsSinceLastPlayed so long sit-outs decay correctly. All state here is
// in-memory (sessionId-keyed maps); no DB is touched.

async function mm() {
  return await import('../server/matchmaking');
}

describe('pure-toggle sit-out — the flag never auto-clears', () => {
  it('survives any number of game-end rounds and only a toggle clears it', async () => {
    const { toggleSittingOut, updatePlayerRestState, getSittingOutPlayers } = await mm();
    const s = 'g3-toggle-1';

    expect(toggleSittingOut(s, 'a')).toBe(true);
    // Three games end while 'a' sits out — pre-Gate-3 the first one cleared the flag
    for (let i = 0; i < 3; i++) updatePlayerRestState(s, 'a', false);
    expect(getSittingOutPlayers(s)).toContain('a');

    expect(toggleSittingOut(s, 'a')).toBe(false);
    expect(getSittingOutPlayers(s)).not.toContain('a');
  });
});

describe('gamesWaited freeze — sitting out never gains queue priority', () => {
  it('frozen for the full sit-out duration; increments resume after toggle-back', async () => {
    const { toggleSittingOut, updatePlayerRestState, getPlayerRestState } = await mm();
    const s = 'g3-freeze-1';

    toggleSittingOut(s, 'a');
    for (let i = 0; i < 3; i++) updatePlayerRestState(s, 'a', false);
    expect(getPlayerRestState(s, 'a').gamesWaited).toBe(0);

    toggleSittingOut(s, 'a'); // back in
    updatePlayerRestState(s, 'a', false); // now genuinely waiting
    expect(getPlayerRestState(s, 'a').gamesWaited).toBe(1);
  });

  it('fairness pin: sit-out vs genuine waiting over the same rounds', async () => {
    const { toggleSittingOut, updatePlayerRestState, getPlayerRestState } = await mm();
    const s = 'g3-fair-1';

    toggleSittingOut(s, 'out');
    for (let i = 0; i < 4; i++) {
      updatePlayerRestState(s, 'out', false);
      updatePlayerRestState(s, 'waiting', false);
    }
    expect(getPlayerRestState(s, 'out').gamesWaited).toBe(0);
    expect(getPlayerRestState(s, 'waiting').gamesWaited).toBe(4);
  });
});

describe('fatigue decay via roundsSinceLastPlayed', () => {
  it('long sit-out fully resets consecutiveGames (halve once, then reset)', async () => {
    const { toggleSittingOut, updatePlayerRestState, getPlayerRestState } = await mm();
    const s = 'g3-decay-1';

    for (let i = 0; i < 4; i++) updatePlayerRestState(s, 'a', true);
    expect(getPlayerRestState(s, 'a').consecutiveGames).toBe(4);
    expect(getPlayerRestState(s, 'a').needsRest).toBe(true);

    toggleSittingOut(s, 'a');
    updatePlayerRestState(s, 'a', false); // round 1 out: halve → 2
    expect(getPlayerRestState(s, 'a').consecutiveGames).toBe(2);
    updatePlayerRestState(s, 'a', false); // round 2 out: full reset → 0
    expect(getPlayerRestState(s, 'a').consecutiveGames).toBe(0);
    expect(getPlayerRestState(s, 'a').needsRest).toBe(false);
  });

  it('return after a sit-out round counts as round 2 out — reset, not a second halve', async () => {
    const { toggleSittingOut, updatePlayerRestState, getPlayerRestState } = await mm();
    const s = 'g3-decay-2';

    for (let i = 0; i < 4; i++) updatePlayerRestState(s, 'a', true);

    toggleSittingOut(s, 'a');
    updatePlayerRestState(s, 'a', false); // round 1 out (sitting): 4 → 2
    toggleSittingOut(s, 'a'); // back in
    updatePlayerRestState(s, 'a', false); // round 2 out (waiting)
    // Pre-Gate-3 this halved again (frozen gamesWaited made it look like
    // round 1); roundsSinceLastPlayed makes it a full reset.
    expect(getPlayerRestState(s, 'a').consecutiveGames).toBe(0);
    // …and the fairness counter starts moving again
    expect(getPlayerRestState(s, 'a').gamesWaited).toBe(1);
  });

  it('playing resets roundsSinceLastPlayed so the next wait halves again', async () => {
    const { updatePlayerRestState, getPlayerRestState } = await mm();
    const s = 'g3-decay-3';

    updatePlayerRestState(s, 'a', false);
    updatePlayerRestState(s, 'a', false); // 2 rounds out
    for (let i = 0; i < 3; i++) updatePlayerRestState(s, 'a', true);
    expect(getPlayerRestState(s, 'a').consecutiveGames).toBe(3);

    updatePlayerRestState(s, 'a', false); // first round out again → halve
    expect(getPlayerRestState(s, 'a').consecutiveGames).toBe(1);
  });
});
