// Gate 8 — Staging runs the same build as production but must mint Ziina TEST intents.
// Ziina test mode is `NODE_ENV !== 'production'` (server/ziinaClient.ts), and `npm start`
// hard-codes NODE_ENV=production, so the Railway `Staging` environment overrides the start
// command in railway.json (config-as-code environment override). Production's start
// command and package.json `start` stay exactly as they were.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const railway = JSON.parse(readFileSync(resolve(__dirname, '..', 'railway.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'));

describe('railway.json — Staging start command override (Gate 8)', () => {
  it('production keeps `npm start` (NODE_ENV=production)', () => {
    expect(railway.deploy.startCommand).toBe('npm start');
    expect(pkg.scripts.start).toBe('NODE_ENV=production node dist/index.js');
    expect(railway.environments?.production).toBeUndefined();
  });

  it('the `Staging` environment starts with NODE_ENV=staging (Ziina test intents, static serving)', () => {
    expect(railway.environments?.Staging?.deploy?.startCommand).toBe('NODE_ENV=staging node dist/index.js');
  });

  it('the override touches only the start command (healthcheck and restart policy inherited)', () => {
    expect(Object.keys(railway.environments?.Staging ?? {})).toEqual(['deploy']);
    expect(Object.keys(railway.environments?.Staging?.deploy ?? {})).toEqual(['startCommand']);
  });
});
