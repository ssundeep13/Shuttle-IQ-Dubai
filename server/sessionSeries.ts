// Weekly recurring sessions.
//
// A session in this app is really three rows: an operational `sessions` row
// (courts, queue, games), a `bookable_sessions` row (what players book), and a
// `session_costs` row (finance). A recurring series generates all three for
// each future week.
//
// SCOPE (v1): weekly cadence only, 4-8 weeks ahead. The admin's ORIGINATING
// session is created by the existing unified path, untouched; only weeks 1..N
// after it are generated here, and they all live or die together in one
// transaction — if generation fails the admin still has the session they made.
//
// DATES: every date is a 'YYYY-MM-DD' string and is written with an explicit
// `::timestamp` cast. Drizzle's timestamp column takes a JS Date, which node-pg
// serialises using the *process* timezone — that works today only because
// Railway runs UTC. Casting from the string removes the dependency entirely.
//
// DELETION ORDER: `bookable_sessions.linked_session_id` is the only enforced
// foreign key pointing at `sessions`, with ON DELETE NO ACTION. Deleting an
// ops row while its bookable row lives raises a FK error, so a stop must remove
// session_costs -> bookable_sessions -> sessions, in that order. session_costs
// has no FK at all: miss it and it orphans silently.
import { randomUUID } from "crypto";
import { sql, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { sessionSeries, sessionCosts, bookableSessions, sessions } from "@shared/schema";
import { seriesDates, weekdayName, SERIES_WEEKS_MIN, SERIES_WEEKS_MAX } from "@shared/utils/seriesDates";

/** Today in Dubai as 'YYYY-MM-DD'. en-CA formats as ISO, and the explicit
 *  timeZone means the server's own zone never enters into it. */
export function todayInDubai(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(Date.now());
}

// ── Stop planning (pure) ────────────────────────────────────────────────────

export interface SeriesSessionRow {
  opsId: string;
  bookableId: string | null;
  dateIso: string;
  bookingCount: number;
  /** The admin's own session, the one the series grew from. Back-linked into
   *  the series so the list can count it — but never removable by a stop. */
  isOrigin?: boolean;
}
export type KeepReason = "is_origin" | "has_bookings" | "already_started";
export interface SeriesStopPlan {
  remove: SeriesSessionRow[];
  keep: (SeriesSessionRow & { reason: KeepReason })[];
}

/** Decides what a stop would do. Pure, so the confirm dialog and the write path
 *  are guaranteed to agree — the admin is shown exactly what will happen.
 *
 *  A session is kept if it holds ANY booking row (cancelled ones included: the
 *  row still points at this session, and deleting would orphan it), or if it
 *  has already started. Only future, entirely unbooked sessions are removed. */
export function planSeriesStop(rows: SeriesSessionRow[], todayIso: string): SeriesStopPlan {
  const plan: SeriesStopPlan = { remove: [], keep: [] };
  for (const r of rows) {
    // Origin first: stopping a series ends the REPEAT, it does not undo the
    // session the admin sat down and created. (It is also the target of
    // session_series.origin_session_id, so the FK would reject the delete.)
    if (r.isOrigin) plan.keep.push({ ...r, reason: "is_origin" });
    else if (r.dateIso <= todayIso) plan.keep.push({ ...r, reason: "already_started" });
    else if (r.bookingCount > 0) plan.keep.push({ ...r, reason: "has_bookings" });
    else plan.remove.push(r);
  }
  return plan;
}

// ── Generation ──────────────────────────────────────────────────────────────

export interface GenerateSeriesInput {
  originSessionId: string;
  anchorDateIso: string;
  weeksAhead: number;
  createdBy: string | null;
  venueName: string;
  venueLocation: string | null;
  venueMapUrl: string | null;
  courtCount: number;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  capacity: number;
  priceAed: number;
  costs: {
    courtCostFils: number;
    shuttleCostFils: number;
    waterCostFils: number;
    courtCostOverridden: boolean;
    captainId: string | null;
  } | null;
}

export interface GeneratedWeek { dateIso: string; opsId: string; bookableId: string }

/** Creates weeks 1..N. All-or-nothing: one transaction covering the series row,
 *  the origin's back-link, and every generated week's three rows. */
export async function generateSeriesWeeks(
  input: GenerateSeriesInput,
): Promise<{ seriesId: string; weeks: GeneratedWeek[] }> {
  if (!Number.isInteger(input.weeksAhead) || input.weeksAhead < SERIES_WEEKS_MIN || input.weeksAhead > SERIES_WEEKS_MAX) {
    throw new Error(`weeksAhead must be between ${SERIES_WEEKS_MIN} and ${SERIES_WEEKS_MAX}`);
  }
  const dates = seriesDates(input.anchorDateIso, input.weeksAhead);
  const seriesId = randomUUID();

  return db.transaction(async (tx) => {
    await tx.insert(sessionSeries).values({
      id: seriesId,
      originSessionId: input.originSessionId,
      venueName: input.venueName,
      originDate: input.anchorDateIso,
      startTime: input.startTime,
      endTime: input.endTime,
      weeksAhead: input.weeksAhead,
      createdBy: input.createdBy,
    });
    // The originating session joins the series so the list can count it.
    await tx.update(sessions).set({ seriesId }).where(eq(sessions.id, input.originSessionId));

    const weeks: GeneratedWeek[] = [];
    for (const dateIso of dates) {
      const opsId = randomUUID();
      const bookableId = randomUUID();

      await tx.insert(sessions).values({
        id: opsId,
        date: sql`${dateIso}::timestamp`,
        venueName: input.venueName,
        venueLocation: input.venueLocation,
        venueMapUrl: input.venueMapUrl,
        courtCount: input.courtCount,
        // Never 'active' (the single-active-session rule) and never sandbox.
        status: 'upcoming',
        isSandbox: false,
        seriesId,
      } as any);

      await tx.insert(bookableSessions).values({
        id: bookableId,
        title: input.title,
        description: input.description,
        venueName: input.venueName,
        venueLocation: input.venueLocation,
        venueMapUrl: input.venueMapUrl,
        date: sql`${dateIso}::timestamp`,
        startTime: input.startTime,
        endTime: input.endTime,
        courtCount: input.courtCount,
        capacity: input.capacity,
        priceAed: input.priceAed,
        status: 'upcoming',
        imageUrl: null,
        linkedSessionId: opsId,
      } as any);

      if (input.costs) {
        await tx.insert(sessionCosts).values({
          id: randomUUID(),
          sessionId: bookableId,
          courtCostFils: input.costs.courtCostFils,
          shuttleCostFils: input.costs.shuttleCostFils,
          waterCostFils: input.costs.waterCostFils,
          courtCostOverridden: input.costs.courtCostOverridden,
          captainId: input.costs.captainId,
          capturedBy: input.createdBy,
        });
      }

      weeks.push({ dateIso, opsId, bookableId });
    }
    return { seriesId, weeks };
  });
}

// ── Listing ─────────────────────────────────────────────────────────────────

export interface SeriesListItem {
  id: string;
  venueName: string;
  weekday: string;
  startTime: string;
  endTime: string;
  originDate: string;
  weeksAhead: number;
  totalSessions: number;
  draftCount: number;
  upcomingCount: number;
  otherCount: number;
  bookedSessions: number;
  stoppedAt: string | null;
}

/** Every series with live counts. The originating session is included in
 *  totalSessions and shown distinctly — the admin created N Tuesdays and the
 *  list should say N. */
export async function listSeries(includeStopped = false): Promise<SeriesListItem[]> {
  const { rows } = await db.execute(sql`
    SELECT ss.id, ss.venue_name, ss.origin_date, ss.start_time, ss.end_time,
           ss.weeks_ahead, ss.stopped_at,
           count(s.id)::int                                            AS total,
           count(*) FILTER (WHERE s.status = 'draft')::int              AS drafts,
           count(*) FILTER (WHERE s.status = 'upcoming')::int           AS upcoming,
           count(*) FILTER (WHERE s.status NOT IN ('draft','upcoming'))::int AS other,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM bookings b
              JOIN bookable_sessions bs2 ON bs2.id = b.session_id
             WHERE bs2.linked_session_id = s.id))::int                  AS booked
      FROM session_series ss
      LEFT JOIN sessions s ON s.series_id = ss.id
     WHERE ${includeStopped ? sql`TRUE` : sql`ss.stopped_at IS NULL`}
     GROUP BY ss.id, ss.venue_name, ss.origin_date, ss.start_time, ss.end_time, ss.weeks_ahead, ss.stopped_at
     ORDER BY ss.created_at DESC`);

  return (rows as any[]).map((r) => ({
    id: r.id,
    venueName: r.venue_name,
    weekday: weekdayName(r.origin_date),
    startTime: r.start_time,
    endTime: r.end_time,
    originDate: r.origin_date,
    weeksAhead: r.weeks_ahead,
    totalSessions: Number(r.total),
    draftCount: Number(r.drafts),
    upcomingCount: Number(r.upcoming),
    otherCount: Number(r.other),
    bookedSessions: Number(r.booked),
    stoppedAt: r.stopped_at ? new Date(r.stopped_at).toISOString() : null,
  }));
}

/** The series' sessions with their booking counts — the input to planSeriesStop.
 *  Dates come back as text so no JS Date is ever constructed from them. */
async function loadSeriesRows(seriesId: string): Promise<SeriesSessionRow[]> {
  const { rows } = await db.execute(sql`
    SELECT s.id AS ops_id,
           to_char(s.date, 'YYYY-MM-DD') AS date_iso,
           bs.id AS bookable_id,
           (s.id = ss.origin_session_id) AS is_origin,
           COALESCE((SELECT count(*) FROM bookings b WHERE b.session_id = bs.id), 0)::int AS booking_count
      FROM sessions s
      JOIN session_series ss ON ss.id = s.series_id
      LEFT JOIN bookable_sessions bs ON bs.linked_session_id = s.id
     WHERE s.series_id = ${seriesId}
     ORDER BY s.date`);
  return (rows as any[]).map((r) => ({
    opsId: r.ops_id,
    bookableId: r.bookable_id ?? null,
    dateIso: r.date_iso,
    bookingCount: Number(r.booking_count),
    isOrigin: !!r.is_origin,
  }));
}

/** What a stop WOULD do. No writes — this is what the confirm dialog shows. */
export async function previewSeriesStop(seriesId: string): Promise<SeriesStopPlan> {
  return planSeriesStop(await loadSeriesRows(seriesId), todayInDubai());
}

/** Stops a series: removes future unbooked sessions, keeps everything else, and
 *  marks the series stopped. One transaction; the plan is recomputed here so a
 *  booking made between preview and confirm still saves its session. */
export async function stopSeries(
  seriesId: string,
  stoppedBy: string | null,
): Promise<SeriesStopPlan> {
  const plan = planSeriesStop(await loadSeriesRows(seriesId), todayInDubai());

  await db.transaction(async (tx) => {
    const bookableIds = plan.remove.map((r) => r.bookableId).filter((x): x is string => !!x);
    const opsIds = plan.remove.map((r) => r.opsId);

    // Order is forced by the one real FK — costs, then bookable, then ops.
    if (bookableIds.length > 0) {
      await tx.delete(sessionCosts).where(inArray(sessionCosts.sessionId, bookableIds));
      await tx.delete(bookableSessions).where(inArray(bookableSessions.id, bookableIds));
    }
    if (opsIds.length > 0) {
      await tx.delete(sessions).where(inArray(sessions.id, opsIds));
    }
    await tx.update(sessionSeries)
      .set({ stoppedAt: new Date(), stoppedBy })
      .where(eq(sessionSeries.id, seriesId));
  });

  return plan;
}
