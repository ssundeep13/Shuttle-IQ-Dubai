// Ordering for the admin session lists.
//
// The API returns sessions ordered by created_at DESC — an insertion order
// that the recurring-series feature turned visibly wrong (a generated batch of
// future weeks rendered first, reversed). Admins think in session dates, so
// the lists sort by date here, at the point the page builds its buckets:
// upcoming soonest-first, ended most-recent-first.
//
// Timezone note: `date` arrives as an ISO string the (UTC) server serialised
// from a naive timestamp. Parsing shifts every value by the same amount for
// any given reader, so ORDER is always preserved — this is the one safe use
// of new Date() on these values. Never use it to derive the calendar day.

/** The fields the comparator needs — Session satisfies this. */
export interface OrderableSession {
  id: string;
  date: string | Date;
  createdAt: string | Date;
}

/** Looks up the linked bookable session, if any — the page already has this
 *  (bookable_sessions carries start_time; the sessions table does not). */
export type LinkedBookableLookup = (sessionId: string) => { startTime: string } | undefined;

const ms = (d: string | Date) => new Date(d).getTime();

/** Ascending: earlier session date first. Same date → linked bookable
 *  start_time (text 'HH:MM', so lexicographic order IS chronological); if
 *  either side has no linked bookable, or the times tie → createdAt. */
export function compareSessionsByDate(
  a: OrderableSession,
  b: OrderableSession,
  getLinkedBookable: LinkedBookableLookup,
): number {
  const byDate = ms(a.date) - ms(b.date);
  if (byDate !== 0) return byDate;
  const ta = getLinkedBookable(a.id)?.startTime;
  const tb = getLinkedBookable(b.id)?.startTime;
  if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
  return ms(a.createdAt) - ms(b.createdAt);
}

export function sortSessionsSoonestFirst<T extends OrderableSession>(
  list: T[],
  getLinkedBookable: LinkedBookableLookup,
): T[] {
  return [...list].sort((a, b) => compareSessionsByDate(a, b, getLinkedBookable));
}

export function sortSessionsLatestFirst<T extends OrderableSession>(
  list: T[],
  getLinkedBookable: LinkedBookableLookup,
): T[] {
  return [...list].sort((a, b) => compareSessionsByDate(b, a, getLinkedBookable));
}
