// Badge Gate 3 — profile UI. Pure helpers (formatEarnedDate,
// progressSubline) unit-tested; brand values, the no-dormant-leak
// guarantee and the Profile wiring pinned as tripwires with M1b live
// verification behind.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { formatEarnedDate, progressSubline } from '../client/src/components/BadgeTag';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('formatEarnedDate — date-only, no timezone re-parse', () => {
  it('renders the ISO date part only, never a time component', () => {
    expect(formatEarnedDate('2026-07-20T16:24:34.280Z')).toBe('20 Jul 2026');
    expect(formatEarnedDate('2026-01-05T00:10:00.000Z')).toBe('5 Jan 2026');
  });

  it('slices the string — a shifted-hours serialization can never shift the rendered date', () => {
    // Same calendar date at both extremes of the naive-timestamp artifact.
    expect(formatEarnedDate('2026-07-20T23:59:59.000Z')).toBe('20 Jul 2026');
    expect(formatEarnedDate('2026-07-20T00:00:01.000Z')).toBe('20 Jul 2026');
  });
});

describe('progressSubline', () => {
  it('no badge → N more to reach Insider', () => {
    expect(progressSubline({ badge: null, badgeStatus: null, currentCheckins: 1, threshold: 4 }))
      .toBe('3 more to reach Insider');
  });

  it('active Insider → N more to reach Inner Circle', () => {
    expect(progressSubline({ badge: 'Insider', badgeStatus: 'active', currentCheckins: 7, threshold: 8 }))
      .toBe('1 more to reach Inner Circle');
  });

  it('active Inner Circle → secured copy (top monthly threshold already met)', () => {
    expect(progressSubline({ badge: 'Inner Circle', badgeStatus: 'active', currentCheckins: 10, threshold: 8 }))
      .toBe('Inner Circle secured this month');
  });

  it('dormant → N more to KEEP the badge, driven by sessionsToReactivate', () => {
    expect(progressSubline({ badge: 'Insider', badgeStatus: 'dormant', sessionsToReactivate: 3, currentCheckins: 1, threshold: 4 }))
      .toBe('3 more to keep Insider');
    expect(progressSubline({ badge: 'Inner Circle', badgeStatus: 'dormant', sessionsToReactivate: 6, currentCheckins: 2, threshold: 8 }))
      .toBe('6 more to keep Inner Circle');
  });

  it('Founding Court → null (the card shows the earned date instead)', () => {
    expect(progressSubline({ badge: 'Founding Court', badgeStatus: 'active', currentCheckins: 10, threshold: 8 }))
      .toBeNull();
  });
});

describe('BadgeTag component (tripwires)', () => {
  const src = read('client/src/components/BadgeTag.tsx');

  // Design Gate 2: BadgeTag now carries the TRUE brand (navy #002C84, cream #F2ECE1) and the FILL teal #00766C.
  it('brand spec: 3px radius, Inter 500, navy #002C84 bg with cream #F2ECE1 text, Founding Court fill teal #00766C', () => {
    expect(src.includes('borderRadius: 3')).toBe(true);
    expect(src.includes('fontWeight: 500')).toBe(true);
    expect(src.includes("const NAVY = '#002C84'")).toBe(true);
    expect(src.includes("const CREAM = '#F2ECE1'")).toBe(true);
    expect(src.includes("const TEAL = '#00766C'")).toBe(true);
    expect(src.includes("founding ? TEAL : NAVY")).toBe(true);
    expect(src.includes("founding ? '#fff' : CREAM")).toBe(true);
  });

  it('NO-LEAK GUARANTEE: the shared tag COMPONENT has no dormant path — dormancy is unrepresentable in it', () => {
    // Scope to the component itself; progressSubline (a text helper below
    // it) legitimately words the dormant subline for the own-profile card.
    const component = src.slice(src.indexOf('export default function BadgeTag'), src.indexOf('const MONTHS'));
    const code = component.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    expect(code.includes('dormant')).toBe(false);
    expect(code.includes('badgeStatus')).toBe(false);
    expect(component.includes('if (!badge) return null;')).toBe(true);
  });

  it('no emoji, no icon imports', () => {
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src)).toBe(false);
    expect(src.includes('lucide')).toBe(false);
  });
});

describe('Profile wiring (tripwires)', () => {
  const src = read('client/src/pages/marketplace/Profile.tsx');

  it('active tag renders ONLY when badgeStatus is active; dormant renders its own local gray tag', () => {
    expect(src.includes("user.badgeStatus === 'active'") && src.includes('<BadgeTag badge={user.badge} testid="tag-profile-badge" />')).toBe(true);
    expect(src.includes("user.badgeStatus === 'dormant'")).toBe(true);
    expect(src.includes('tag-profile-badge-dormant')).toBe(true);
    expect(src.includes("background: '#E5E7EB', color: '#4B5563'")).toBe(true);
  });

  // Design Gate 2: the progress bar is a FILL → #00766C (text teal #006B5F is reserved for type).
  it('progress card: title via progressTitle (Gate 4 copy fix), fill-teal #00766C bar, subline via progressSubline, founding earned date via formatEarnedDate', () => {
    expect(src.includes('progressTitle(user.badgeProgress.currentCheckins, user.badgeProgress.threshold)')).toBe(true);
    expect(src.includes("background: '#00766C'")).toBe(true);
    expect(src.includes('progressSubline({')).toBe(true);
    expect(src.includes('Founding Court since {formatEarnedDate(user.foundingCourtEarnedDate)}')).toBe(true);
  });

  it('streak stat: win streak in teal from the same stats source as the Dashboard', () => {
    expect(src.includes("queryKey: ['/api/players', user?.linkedPlayerId, 'stats']")).toBe(true);
    expect(src.includes('text-profile-streak')).toBe(true);
    expect(src.includes('-win streak')).toBe(true);
  });

  it('no emoji in the new badge sections', () => {
    const badgeRegion = src.slice(src.indexOf('card-badge-progress') - 600, src.indexOf('text-profile-streak') + 400);
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(badgeRegion)).toBe(false);
  });
});
