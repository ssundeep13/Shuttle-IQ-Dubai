// ISO-8601 week bucketing (Mon–Sun) for the portal's weekly views (Phase 3, locked
// decision 4). Pure date math on 'YYYY-MM-DD' strings — session dates are bucketed by
// their calendar date, so no timezone is involved here at all.
//
// ISO rules: weeks run Monday→Sunday; week 1 is the week containing the year's first
// Thursday. Early-January days can therefore belong to the PREVIOUS iso year and
// late-December days to the NEXT one — that's why isoYear is carried separately from
// the calendar year. The tests pin the real boundary cases.

export interface IsoWeek {
  isoYear: number;
  isoWeek: number; // 1..53
  label: string;   // "2026-W23"
  weekStart: string; // Monday, YYYY-MM-DD
  weekEnd: string;   // Sunday, YYYY-MM-DD
}

function toUtc(dateIso: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// dateIso: 'YYYY-MM-DD'
export function isoWeekOf(dateIso: string): IsoWeek {
  const date = toUtc(dateIso);
  // ISO day-of-week: Mon=1..Sun=7 (JS getUTCDay: Sun=0..Sat=6)
  const isoDow = ((date.getUTCDay() + 6) % 7) + 1;

  // The Thursday of this date's week decides the ISO year...
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + (4 - isoDow));
  const isoYear = thursday.getUTCFullYear();

  // ...and the week number is how many whole weeks that Thursday sits past Jan 1
  // of the ISO year (Jan 1 is always in week 1's Mon–Sun span or earlier).
  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.floor((thursday.getTime() - jan1.getTime()) / 86400000 / 7) + 1;

  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (isoDow - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    isoYear,
    isoWeek,
    label: `${isoYear}-W${String(isoWeek).padStart(2, "0")}`,
    weekStart: fmt(monday),
    weekEnd: fmt(sunday),
  };
}
