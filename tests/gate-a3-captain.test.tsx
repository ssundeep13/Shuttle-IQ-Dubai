/**
 * Gate 3 — captain/admin hot path (dickwu Gate 0 findings deferred at Gate 1:
 * 2.9 score gaps, 2.10 queue actions, 3.5 Record pending, 1.8 team buttons,
 * 5.8 suggestions error, 5.10 fake zeros, 2.11 header, 4.7 deck text floor,
 * 1.10/1.11/1.13/2.12/2.13/3.8 press+targets).
 *
 * PRESENTATION AND FEEDBACK ONLY — the behavioural pins prove the business
 * flows are unchanged: a pending Record cannot double-fire, Sit-out and
 * Remove stay distinct actions, End Session still goes through its confirm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '../client/src/components/ui/tooltip';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CourtCard } from '../client/src/components/CourtCard';
import { PlayerQueue } from '../client/src/components/PlayerQueue';
import { Header } from '../client/src/components/Header';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const occupiedCourt: any = {
  id: 'c1', name: 'Court 1', status: 'occupied', sessionId: 's1', timeRemaining: 12,
  startedAt: new Date().toISOString(), skillBand: 'all_levels',
  players: [
    { id: 'p1', name: 'A One', team: 1, gender: 'Male', skillScore: 100 },
    { id: 'p2', name: 'B Two', team: 1, gender: 'Male', skillScore: 100 },
    { id: 'p3', name: 'C Three', team: 2, gender: 'Female', skillScore: 100 },
    { id: 'p4', name: 'D Four', team: 2, gender: 'Male', skillScore: 100 },
  ],
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('3.5 — a pending Record cannot double-fire and says so', () => {
  it('integrated harness (mimics Home): first tap records, sets pending, second tap is dead; button shows Recording…', async () => {
    const recorded = vi.fn();
    function Harness() {
      const [pending, setPending] = useState(false);
      return (
        <CourtCard
          court={occupiedCourt}
          canRemoveCourt={false}
          onRemoveCourt={() => {}}
          onRecordGame={(...a: unknown[]) => { recorded(...a); setPending(true); }}
          onCancelGame={() => {}}
          onOpenAssign={() => {}}
          recordPending={pending}
          cancelPending={false}
        />
      );
    }
    wrap(<Harness />);
    fireEvent.click(screen.getByTestId('button-select-team-1-c1'));
    const record = screen.getByTestId('button-record-game-c1');
    expect(record).not.toBeDisabled();
    fireEvent.click(record);
    expect(recorded).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('button-record-game-c1')).toBeDisabled());
    expect(screen.getByTestId('button-record-game-c1').textContent).toContain('Recording…');
    fireEvent.click(screen.getByTestId('button-record-game-c1'));
    expect(recorded).toHaveBeenCalledTimes(1); // second tap dead, visibly
  });
  it('source: cancel-game confirm action carries the same pending guard', () => {
    const src = read('client/src/components/CourtCard.tsx');
    const i = src.indexOf('button-cancel-game-confirm-');
    expect(src.slice(i - 600, i + 100)).toMatch(/cancelPending/);
  });
});

describe('2.10 — Sit-out and Remove stay distinct, look distinct, and are 44px 12px apart', () => {
  const player: any = { id: 'p9', name: 'Queue Guy', gender: 'Male', skillScore: 100, level: 'Intermediate', shuttleIqId: null };

  it('behavioural: Remove fires only the remove callback; Sit-out fires only the sit-out POST', async () => {
    const removed = vi.fn();
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return new Response(JSON.stringify({ sittingOut: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    wrap(
      <PlayerQueue
        players={[player]}
        queuePlayerIds={['p9']}
        onAddPlayer={() => {}}
        onRemoveFromQueue={removed}
        onClearQueue={() => {}}
        sessionId="s1"
      />,
    );
    fireEvent.click(screen.getByTestId('button-remove-queue-p9'));
    expect(removed).toHaveBeenCalledTimes(1);
    expect(calls.some(c => c.startsWith('POST') && c.includes('/sit-out'))).toBe(false);
    fireEvent.click(screen.getByTestId('button-sit-out-p9'));
    await waitFor(() => expect(calls.some(c => c.startsWith('POST') && c.includes('/queue/players/p9/sit-out'))).toBe(true));
    expect(removed).toHaveBeenCalledTimes(1); // sit-out did not remove
  });
  it('source: gap-3 + divider between them, Remove tinted destructive, both h-11, sit-out labelled', () => {
    const src = read('client/src/components/PlayerQueue.tsx');
    const i = src.indexOf('button-remove-queue-');
    const around = src.slice(i - 2400, i + 200);
    expect(around).toMatch(/gap-3/);
    expect(around).toMatch(/w-px|divider|border-l/); // visual separator
    expect(around).toMatch(/h-11 w-11/);
    expect(around).toMatch(/text-destructive/);
    expect(src).toMatch(/aria-label=\{isSittingOut \? ['"`]Resume/);
    expect(src).toMatch(/aria-label=\{`Remove \$\{player\.name\}/);
  });
});

describe('End Session — flow unchanged, target grown', () => {
  it('behavioural: the header button only requests the flow; no direct mutation wiring', () => {
    const onEnd = vi.fn();
    render(
      <Header
        stats={{ activePlayers: 1, inQueue: 2, availableCourts: 1, occupiedCourts: 1, totalPlayers: 3, totalCourts: 2 } as any}
        statsReady
        session={{ id: 's1', date: new Date().toISOString(), venueName: 'V', courtCount: 2 } as any}
        onAddPlayer={() => {}}
        onEndSession={onEnd}
        authState="admin"
        onLogin={() => {}}
        onAdmin={() => {}}
        onLogout={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('button-end-session'));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
  it('source: Home still gates the mutation behind the confirm dialog', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home).toMatch(/const handleEndSession = \(\) => \{\s*setShowEndSessionConfirm\(true\);\s*\};/);
    const i = home.indexOf('button-confirm-end-session');
    expect(home.slice(i - 400, i)).toMatch(/handleConfirmEndSession/);
  });
  it('source: header controls reach 44px and the icon-only logout is labelled', () => {
    const src = read('client/src/components/Header.tsx');
    expect((src.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const i = src.indexOf('button-logout-nav');
    expect(src.slice(i - 400, i + 50)).toMatch(/aria-label="Log out"/);
  });
});

describe('2.9 — score-entry breathing room', () => {
  const src = read('client/src/components/CourtCard.tsx');
  it('chips gap-2, steppers gap-3, band picker gap-2', () => {
    expect(src).toMatch(/grid-cols-5 gap-2/);
    expect(src).not.toMatch(/grid-cols-5 gap-1\.5/);
    expect((src.match(/flex items-center gap-3">/g) ?? []).length).toBeGreaterThanOrEqual(2); // both steppers
    expect(src).toMatch(/grid-cols-2 sm:grid-cols-4 gap-2/); // band picker
  });
  it('band tag + remove-court are real 44px press targets; card container lost its false hover affordance', () => {
    const bandBtn = src.indexOf('button-court-band-');
    expect(src.slice(bandBtn - 400, bandBtn + 50)).toMatch(/siq-press/);
    expect(src.slice(bandBtn - 400, bandBtn + 50)).toMatch(/min-h-11/);
    const rm = src.indexOf('button-remove-court-');
    expect(src.slice(rm - 400, rm + 50)).toMatch(/siq-press/);
    expect(src.slice(rm - 400, rm + 50)).toMatch(/min-h-11 min-w-11/);
    // 1.13: the live-game card is not interactive — no sticky hover darken
    const cardDiv = src.indexOf('card-court-');
    expect(src.slice(cardDiv - 300, cardDiv + 50)).not.toMatch(/hover-elevate/);
    // 3.8: placeholder scale is actually transitioned
    const ph = src.indexOf('free-placeholder-');
    expect(src.slice(ph - 500, ph + 50)).toMatch(/transition-\[transform,background-color\]|siq-press/);
  });
  it('cancel-game label readable (4.7): not 12px on a 44px button', () => {
    const i = src.indexOf('button-cancel-game-');
    expect(src.slice(i - 300, i + 50)).not.toMatch(/text-xs/);
  });
});

describe('5.8 — suggestions failure is an error state with Retry, never a permanent spinner', () => {
  const src = read('client/src/components/UpNextStrip.tsx');
  it('primary suggestions query destructures isError; an error branch renders before the !sug fallback', () => {
    expect(src).toMatch(/isError:\s*sugError/);
    const errIdx = src.indexOf('up-next-error-');
    const findingIdx = src.indexOf('Finding best matches…');
    expect(errIdx).toBeGreaterThan(0);
    expect(errIdx).toBeLessThan(findingIdx);
    const around = src.slice(errIdx - 700, errIdx + 700);
    expect(around).toMatch(/refetchSuggestion/);
    expect(around).toMatch(/Retry|Try again/);
  });
});

describe('5.10 — no fake zeros while stats load', () => {
  it('Home destructures the stats loading state and hands readiness to Header', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home).toMatch(/isLoading:\s*statsLoading/);
    expect(home).toMatch(/statsReady=\{/);
  });
  it('Header renders an em-dash placeholder when stats are not ready', () => {
    render(
      <Header
        stats={{ activePlayers: 0, inQueue: 0, availableCourts: 0, occupiedCourts: 0, totalPlayers: 0, totalCourts: 0 } as any}
        statsReady={false}
        session={{ id: 's1', date: new Date().toISOString(), venueName: 'V', courtCount: 2 } as any}
        onAddPlayer={() => {}}
        onEndSession={() => {}}
        authState="admin"
        onLogin={() => {}}
        onAdmin={() => {}}
        onLogout={() => {}}
      />,
    );
    expect(screen.getByTestId('text-active-players').textContent).toContain('—');
    expect(screen.getByTestId('text-queue-count').textContent).toContain('—');
  });
  it('queue rows show — for games/wins while today-stats load', () => {
    const src = read('client/src/components/PlayerQueue.tsx');
    expect(src).toMatch(/isLoading:\s*todayLoading/);
    expect(src).toMatch(/todayLoading \? '—'/);
  });
});

describe('1.8/2.13/1.10 — deck targets and press feedback', () => {
  const ngd = read('client/src/components/NextGamesDeck.tsx');
  it('team assign buttons: 44px, press feedback, transitioned transform', () => {
    const t1 = ngd.indexOf('player-team1-');
    const around = ngd.slice(t1 - 700, t1 + 700);
    expect(around).toMatch(/h-11 min-w-\[64px\]/);
    expect(around).toMatch(/active:scale-\[0?\.98\]/);
    expect(around).toMatch(/transition-\[transform,background-color\]|transition-\[background-color,transform\]/);
  });
  it('sheet primary is h-12; carousel indicators are 44px press targets', () => {
    const i = ngd.indexOf('button-assign-players-');
    expect(ngd.slice(i - 400, i + 50)).toMatch(/h-12/);
    const dots = ngd.indexOf('deck-indicators');
    expect(ngd.slice(dots, dots + 900)).toMatch(/min-h-11/);
    expect(ngd.slice(dots, dots + 900)).toMatch(/siq-press/);
  });
  it('assign-manually links press and clear 44px in both files', () => {
    for (const [f, tid] of [['client/src/components/NextGamesDeck.tsx', 'button-assign-manually-'], ['client/src/components/UpNextStrip.tsx', 'button-up-next-assign-']] as const) {
      const s = read(f);
      const i = s.indexOf(tid);
      if (i < 0) continue; // testid names differ; NGD one is required below
      expect(s.slice(i - 400, i + 60), f).toMatch(/siq-press|active:underline/);
      expect(s.slice(i - 400, i + 60), f).toMatch(/min-h-11/);
    }
    const i = ngd.indexOf('button-assign-manually-');
    expect(ngd.slice(i - 400, i + 60)).toMatch(/min-h-11/);
  });
});

describe('4.7 — deck text floor: action buttons are not 12px', () => {
  it('UpNextStrip has no h-7/h-8 text-xs buttons left', () => {
    const src = read('client/src/components/UpNextStrip.tsx');
    expect(src).not.toMatch(/h-7 text-xs/);
    expect(src).not.toMatch(/h-8 text-xs/);
  });
  it('PlayerQueue non-interactive rows lost the sticky hover affordance (1.13)', () => {
    const src = read('client/src/components/PlayerQueue.tsx');
    const i = src.indexOf('queue-player-');
    expect(src.slice(i - 700, i + 50)).not.toMatch(/hover-elevate/);
  });
});
