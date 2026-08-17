// Admin session-list ordering. The server returns sessions ordered by
// created_at DESC (an insertion order), which the recurring-series feature
// exposed as nonsense: a batch of generated future weeks renders first and
// reversed (22 Sep before 1 Sep before 22 Aug). The admin lists sort by the
// SESSION DATE instead: upcoming soonest-first, ended most-recent-first.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  compareSessionsByDate, sortSessionsSoonestFirst, sortSessionsLatestFirst,
} from '../client/src/lib/sessionOrdering';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

// Sessions as the page receives them: ISO strings serialised by the (UTC)
// server from naive timestamps. Ordering by parsed date is timezone-safe —
// any reader shifts every value uniformly.
const s = (id: string, date: string, createdAt = '2026-08-01T00:00:00.000Z') =>
  ({ id, date: `${date}T00:00:00.000Z`, createdAt });

const noBookables = () => undefined;
const startTimes = (map: Record<string, string>) =>
  (sessionId: string) => (map[sessionId] ? { startTime: map[sessionId] } : undefined);

describe('upcoming — soonest first', () => {
  it('sorts ascending by session date regardless of arrival order', () => {
    // Arrival order = the real bug: created_at DESC put the series batch first, reversed.
    const arrival = [s('sep22', '2026-09-22'), s('sep15', '2026-09-15'), s('sep08', '2026-09-08'),
                     s('sep01', '2026-09-01'), s('aug25', '2026-08-25'), s('aug22', '2026-08-22')];
    expect(sortSessionsSoonestFirst(arrival, noBookables).map(x => x.id))
      .toEqual(['aug22', 'aug25', 'sep01', 'sep08', 'sep15', 'sep22']);
  });

  it('does not mutate the input array', () => {
    const arrival = [s('b', '2026-09-01'), s('a', '2026-08-22')];
    const before = arrival.map(x => x.id);
    sortSessionsSoonestFirst(arrival, noBookables);
    expect(arrival.map(x => x.id)).toEqual(before);
  });
});

describe('ended — most recent first', () => {
  it('sorts descending by session date', () => {
    const arrival = [s('aug10', '2026-08-10'), s('aug14', '2026-08-14'), s('aug12', '2026-08-12')];
    expect(sortSessionsLatestFirst(arrival, noBookables).map(x => x.id))
      .toEqual(['aug14', 'aug12', 'aug10']);
  });
});

describe('same-date tiebreak — linked bookable start_time, then createdAt', () => {
  it('orders same-day sessions by their bookable start_time (lexicographic HH:MM)', () => {
    const list = [s('evening', '2026-08-25'), s('morning', '2026-08-25'), s('noon', '2026-08-25')];
    const lookup = startTimes({ evening: '20:00', morning: '09:00', noon: '12:00' });
    expect(sortSessionsSoonestFirst(list, lookup).map(x => x.id))
      .toEqual(['morning', 'noon', 'evening']);
    // and the descending list mirrors it
    expect(sortSessionsLatestFirst(list, lookup).map(x => x.id))
      .toEqual(['evening', 'noon', 'morning']);
  });

  it('falls back to createdAt when either session has no linked bookable', () => {
    const list = [
      s('late-created', '2026-08-25', '2026-08-16T00:00:00.000Z'),
      s('early-created', '2026-08-25', '2026-08-10T00:00:00.000Z'),
    ];
    // one side has a start time, the other doesn't → start times are unusable
    const lookup = startTimes({ 'late-created': '20:00' });
    expect(sortSessionsSoonestFirst(list, lookup).map(x => x.id))
      .toEqual(['early-created', 'late-created']);
  });

  it('falls back to createdAt when start times are equal', () => {
    const list = [
      s('second', '2026-08-25', '2026-08-16T00:00:00.000Z'),
      s('first', '2026-08-25', '2026-08-10T00:00:00.000Z'),
    ];
    const lookup = startTimes({ second: '20:00', first: '20:00' });
    expect(sortSessionsSoonestFirst(list, lookup).map(x => x.id))
      .toEqual(['first', 'second']);
  });

  it('the comparator is a total order (asc negates to desc)', () => {
    const a = s('a', '2026-08-25', '2026-08-10T00:00:00.000Z');
    const b = s('b', '2026-08-26', '2026-08-09T00:00:00.000Z');
    expect(Math.sign(compareSessionsByDate(a, b, noBookables)))
      .toBe(-Math.sign(compareSessionsByDate(b, a, noBookables)));
    expect(compareSessionsByDate(a, a, noBookables)).toBe(0);
  });
});

describe('wiring — the page sorts at the filter site', () => {
  const src = read('client/src/pages/SessionsManagement.tsx');

  it('upcoming and sandbox sort soonest-first; ended latest-first; active untouched', () => {
    expect(src).toMatch(/upcomingSessions = sortSessionsSoonestFirst\(/);
    expect(src).toMatch(/endedSessions = sortSessionsLatestFirst\(/);
    expect(src).toMatch(/sortSessionsSoonestFirst\(sandboxSessions/);
    expect(src).toMatch(/activeSessions = sessions\.filter/); // no sort wrapper
  });
});
