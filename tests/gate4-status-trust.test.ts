import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Gate 4 — status & trust (audit F6/F7/F9/F10 + timer tone).
// No mutation paths, no polling intervals, no endpoints.

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Gate 4 — status & trust', () => {
  it('F6: offline visibility — hook on onlineManager, strip below the header, self-clearing', () => {
    const hook = read('client/src/hooks/useOfflineStatus.ts');
    expect(hook.includes('onlineManager')).toBe(true);
    expect(hook.includes('useSyncExternalStore')).toBe(true);
    const home = read('client/src/pages/Home.tsx');
    expect(home.includes('useOfflineStatus')).toBe(true);
    expect(home.includes('banner-offline')).toBe(true);
    expect(home.includes('Offline — showing last known state')).toBe(true);
    // visibility only: the strip must not touch mutations or queues
    expect(home.includes('mutationCache')).toBe(false);
  });

  it('F7: single pulse — the base-load pulse yields when the AI pulse is live', () => {
    const s = read('client/src/components/UpNextStrip.tsx');
    expect(s.includes('{sugLoading && !aiFetching && (')).toBe(true);
    // exactly the two known pulse sites, no new ones
    expect((s.match(/animate-pulse/g) || []).length).toBe(2);
  });

  it('F9: open editors reset when the rendered lineup identity changes (render-time pattern)', () => {
    const s = read('client/src/components/UpNextStrip.tsx');
    // locked editor keyed on the queued row id
    expect(s.includes('prevQueuedId')).toBe(true);
    const lockedReset = s.slice(s.indexOf('prevQueuedId'), s.indexOf('prevQueuedId') + 500);
    expect(lockedReset.includes('setExpanded(false)')).toBe(true);
    expect(lockedReset.includes('setSwapOutId(null)')).toBe(true);
    // ephemeral swap picker keyed on the lineup signature, not the index
    expect(s.includes('prevLineupSig')).toBe(true);
    const ephReset = s.slice(s.indexOf('prevLineupSig'), s.indexOf('prevLineupSig') + 500);
    expect(ephReset.includes('setEphemeralSwapSlot(null)')).toBe(true);
    // composed edits are Gate 6 territory — these resets must not touch them
    expect(lockedReset.includes('setComposed')).toBe(false);
    expect(ephReset.includes('setComposed')).toBe(false);
  });

  it('F10: data loading renders content-shaped skeletons, not a lone spinner', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home.includes('from "@/components/ui/skeleton"')).toBe(true);
    expect(home.includes('loading-skeleton')).toBe(true);
    const block = home.slice(home.indexOf('loading-skeleton') - 800, home.indexOf('loading-skeleton') + 800);
    expect(block.includes('animate-spin')).toBe(false);
    expect(block.includes('<Skeleton')).toBe(true);
  });

  it('timer tone: urgency colors come from tokens, not stock palette', () => {
    const s = read('client/src/components/CourtCard.tsx');
    const fn = s.slice(s.indexOf('const timerColor'), s.indexOf('// Compact gender'));
    expect(fn.includes('text-destructive')).toBe(true);
    expect(fn.includes('text-warning')).toBe(true);
    expect(fn.includes('red-600')).toBe(false);
    expect(fn.includes('amber-500')).toBe(false);
  });
});
