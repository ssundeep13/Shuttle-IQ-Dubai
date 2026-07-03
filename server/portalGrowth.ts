// Phase 5 — growth reports. READ-ONLY: SELECTs + pure aggregation, no writes anywhere.
// Locked rules baked in:
//  • Everything June 2026 onward (PORTAL_EPOCH_ISO), session-date attribution.
//  • ATTENDANCE = bookings.attended_at IS NOT NULL (Sandeep's decision (a)) — the status
//    column's 'attended' value is nearly unused in prod; attended_at is the real stamp.
//  • LTV reuses the EXISTING per-session VALUE profit (computeSessionProfitsBatchFils →
//    valueProfitFils: collected + wallet − refunds − costs, zero-floored). BOOKING basis
//    (Sandeep's revision at ship gate): per-seat = valueProfit ÷ Σ confirmed/paid booked
//    spots in the session; each booker's LTV += their spotsBooked × per-seat — guest
//    seats go to the booker. Attendance plays NO role in LTV.
//  • ISO Mon–Sun weeks via shared/isoWeek.

import { sql } from "drizzle-orm";
import { isoWeekOf } from "@shared/isoWeek";
import { PORTAL_EPOCH_ISO } from "./portalFinance";
import { computeSessionProfitsBatchFils } from "./sessionProfit";

export interface AttendanceRow {
  userId: string;
  userName: string;
  gender: string | null;      // via marketplace_users.linked_player_id → players.gender
  sessionId: string;
  sessionDate: string;        // YYYY-MM-DD
  spotsBooked: number;
}
export interface GrowthData {
  attendance: AttendanceRow[];                                  // attended_at IS NOT NULL only
  bookingSeats: AttendanceRow[];                                // confirmed/attended bookings (paid basis) — LTV only; gender unused (null)
  signups: Array<{ dateIso: string }>;                          // marketplace_users June+
  bookingsCreated: Array<{ dateIso: string }>;                  // confirmed/attended, by created_at, June+
  referrals: Array<{ status: string; completedIso: string | null }>;
  sessions: Array<{ sessionId: string; dateIso: string; capacity: number | null; bookedSpots: number; isPast: boolean }>;
  preJuneSignups: number;
  preJuneCompletedReferrals: number;
}

export async function loadGrowthData(): Promise<GrowthData> {
  const { db } = await import("./db");
  const q = async (query: any) => (await db.execute(query)).rows as any[];
  const EPOCH = PORTAL_EPOCH_ISO;

  const attendance = (await q(sql`
    SELECT b.user_id, mu.name AS user_name, p.gender, b.session_id, b.spots_booked,
           to_char(s.date,'YYYY-MM-DD') AS session_date
    FROM bookings b
    JOIN bookable_sessions s ON s.id = b.session_id
    JOIN marketplace_users mu ON mu.id = b.user_id
    LEFT JOIN players p ON p.id = mu.linked_player_id
    WHERE s.date >= ${EPOCH}::timestamp AND b.attended_at IS NOT NULL`)).map((r) => ({
    userId: r.user_id, userName: r.user_name, gender: r.gender ?? null,
    sessionId: r.session_id, sessionDate: r.session_date, spotsBooked: Number(r.spots_booked),
  }));

  // LTV's booking basis: every confirmed/attended booking's seats, attendance ignored.
  const bookingSeats = (await q(sql`
    SELECT b.user_id, mu.name AS user_name, b.session_id, b.spots_booked,
           to_char(s.date,'YYYY-MM-DD') AS session_date
    FROM bookings b
    JOIN bookable_sessions s ON s.id = b.session_id
    JOIN marketplace_users mu ON mu.id = b.user_id
    WHERE s.date >= ${EPOCH}::timestamp AND b.status IN ('confirmed','attended')`)).map((r) => ({
    userId: r.user_id, userName: r.user_name, gender: null,
    sessionId: r.session_id, sessionDate: r.session_date, spotsBooked: Number(r.spots_booked),
  }));

  const signups = (await q(sql`
    SELECT to_char(created_at,'YYYY-MM-DD') AS d FROM marketplace_users
    WHERE created_at >= ${EPOCH}::timestamp`)).map((r) => ({ dateIso: r.d }));
  const preJuneSignups = Number((await q(sql`
    SELECT count(*)::int AS n FROM marketplace_users WHERE created_at < ${EPOCH}::timestamp`))[0].n);

  const bookingsCreated = (await q(sql`
    SELECT to_char(created_at,'YYYY-MM-DD') AS d FROM bookings
    WHERE created_at >= ${EPOCH}::timestamp AND status IN ('confirmed','attended')`)).map((r) => ({ dateIso: r.d }));

  const referrals = (await q(sql`
    SELECT status, to_char(completed_at,'YYYY-MM-DD') AS c FROM referrals`)).map((r) => ({
    status: r.status, completedIso: r.c ?? null,
  }));
  const preJuneCompletedReferrals = referrals.filter(
    (r) => r.status === "completed" && r.completedIso && r.completedIso < EPOCH).length;

  const sessions = (await q(sql`
    SELECT s.id, to_char(s.date,'YYYY-MM-DD') AS d, s.capacity, (s.date < now()) AS is_past,
           COALESCE((SELECT sum(b.spots_booked)::int FROM bookings b
                     WHERE b.session_id = s.id AND b.status IN ('confirmed','attended')), 0) AS booked
    FROM bookable_sessions s WHERE s.date >= ${EPOCH}::timestamp`)).map((r) => ({
    sessionId: r.id, dateIso: r.d, capacity: r.capacity == null ? null : Number(r.capacity),
    bookedSpots: Number(r.booked), isPast: !!r.is_past,
  }));

  return { attendance, bookingSeats, signups, bookingsCreated, referrals, sessions, preJuneSignups, preJuneCompletedReferrals };
}

// ── helpers ───────────────────────────────────────────────────────────────────
const month = (d: string) => d.slice(0, 7);
// distinct attended sessions per user, with first/last dates + attended-spots per session
function perUser(attendance: AttendanceRow[]) {
  const users = new Map<string, { name: string; gender: string | null; sessions: Map<string, { dateIso: string; spots: number }> }>();
  for (const a of attendance) {
    let u = users.get(a.userId);
    if (!u) { u = { name: a.userName, gender: a.gender, sessions: new Map() }; users.set(a.userId, u); }
    const s = u.sessions.get(a.sessionId);
    if (s) s.spots += a.spotsBooked;
    else u.sessions.set(a.sessionId, { dateIso: a.sessionDate, spots: a.spotsBooked });
  }
  return users;
}

// ── 1. Repeat rate ────────────────────────────────────────────────────────────
export function computeRepeatRate(attendance: AttendanceRow[]) {
  const users = perUser(attendance);
  const counts = Array.from(users.values()).map((u) => u.sessions.size);
  const total = counts.length;
  const ge = (n: number) => counts.filter((c) => c >= n).length;
  const dist = new Map<number, number>();
  for (const c of counts) dist.set(c, (dist.get(c) ?? 0) + 1);
  return {
    playersWithAttendance: total,
    ge2: ge(2), ge3: ge(3), ge5: ge(5),
    pct2: total ? Math.round((ge(2) / total) * 1000) / 10 : 0,
    pct3: total ? Math.round((ge(3) / total) * 1000) / 10 : 0,
    pct5: total ? Math.round((ge(5) / total) * 1000) / 10 : 0,
    distribution: Array.from(dist.entries()).sort((a, b) => a[0] - b[0])
      .map(([sessions, players]) => ({ sessions, players })),
  };
}

// ── 2. Third-session retention (cohort by first attended month) ──────────────
export function computeThirdSessionRetention(attendance: AttendanceRow[]) {
  const users = perUser(attendance);
  const cohorts = new Map<string, { size: number; reached3: number }>();
  for (const u of Array.from(users.values())) {
    const dates = Array.from(u.sessions.values()).map((s) => s.dateIso).sort();
    const m = month(dates[0]);
    const c = cohorts.get(m) ?? { size: 0, reached3: 0 };
    c.size++; if (dates.length >= 3) c.reached3++;
    cohorts.set(m, c);
  }
  return Array.from(cohorts.entries()).sort()
    .map(([m, c]) => ({ month: m, cohortSize: c.size, reached3: c.reached3, pct: c.size ? Math.round((c.reached3 / c.size) * 1000) / 10 : 0 }));
}

// ── 3. Lapsed players ─────────────────────────────────────────────────────────
export function computeLapsed(attendance: AttendanceRow[], todayIso: string, days: number) {
  const users = perUser(attendance);
  const cutoff = new Date(new Date(`${todayIso}T00:00:00Z`).getTime() - days * 86400e3).toISOString().slice(0, 10);
  const lapsed: Array<{ name: string; lastSessionDate: string; lifetimeSessions: number }> = [];
  for (const u of Array.from(users.values())) {
    const dates = Array.from(u.sessions.values()).map((s) => s.dateIso).sort();
    const last = dates[dates.length - 1];
    if (last < cutoff) lapsed.push({ name: u.name, lastSessionDate: last, lifetimeSessions: dates.length });
  }
  return lapsed.sort((a, b) => a.lastSessionDate.localeCompare(b.lastSessionDate));
}

// ── 4. Signup / booking growth ────────────────────────────────────────────────
function bucketCounts(dates: Array<{ dateIso: string }>) {
  const weekly = new Map<string, number>(); const monthly = new Map<string, number>();
  const weekMeta = new Map<string, string>();
  for (const { dateIso } of dates) {
    const w = isoWeekOf(dateIso);
    weekly.set(w.label, (weekly.get(w.label) ?? 0) + 1);
    weekMeta.set(w.label, w.weekStart);
    monthly.set(month(dateIso), (monthly.get(month(dateIso)) ?? 0) + 1);
  }
  return {
    weekly: Array.from(weekly.entries()).sort((a, b) => weekMeta.get(a[0])!.localeCompare(weekMeta.get(b[0])!))
      .map(([label, count]) => ({ label, count })),
    monthly: Array.from(monthly.entries()).sort().map(([m, count]) => ({ month: m, count })),
  };
}
export function computeGrowth(signups: Array<{ dateIso: string }>, bookings: Array<{ dateIso: string }>) {
  return { signups: bucketCounts(signups), bookings: bucketCounts(bookings) };
}

// ── 5. Referral acquisition ───────────────────────────────────────────────────
export function computeReferrals(referrals: GrowthData["referrals"]) {
  const byStatus = new Map<string, number>();
  for (const r of referrals) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const monthly = new Map<string, number>();
  for (const r of referrals) {
    if (r.status !== "completed" || !r.completedIso || r.completedIso < PORTAL_EPOCH_ISO) continue;
    monthly.set(month(r.completedIso), (monthly.get(month(r.completedIso)) ?? 0) + 1);
  }
  return {
    totals: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    completedMonthly: Array.from(monthly.entries()).sort().map(([m, count]) => ({ month: m, count })),
  };
}

// ── 6. Women's participation ──────────────────────────────────────────────────
export function computeWomens(attendance: AttendanceRow[]) {
  const months = new Map<string, { players: Map<string, string | null>; att: number; attF: number }>();
  for (const a of attendance) {
    const m = month(a.sessionDate);
    let e = months.get(m);
    if (!e) { e = { players: new Map(), att: 0, attF: 0 }; months.set(m, e); }
    e.players.set(a.userId, a.gender);
    e.att += a.spotsBooked;                       // attendances incl. guest seats
    if (a.gender === "Female") e.attF += a.spotsBooked;
  }
  const unknownGenderPlayers = new Set(attendance.filter((a) => a.gender == null).map((a) => a.userId)).size;
  return {
    unknownGenderPlayers, // bookers with no linked player record — excluded from % players
    monthly: Array.from(months.entries()).sort().map(([m, e]) => {
      const known = Array.from(e.players.values()).filter((g) => g != null);
      const f = known.filter((g) => g === "Female").length;
      return {
        month: m,
        uniquePlayers: e.players.size,
        femalePlayers: f,
        pctPlayers: known.length ? Math.round((f / known.length) * 1000) / 10 : 0,
        attendances: e.att,
        femaleAttendances: e.attF,
        pctAttendances: e.att ? Math.round((e.attF / e.att) * 1000) / 10 : 0,
      };
    }),
  };
}

// ── 7. Fill rate (past sessions only — future ones are still selling) ─────────
export function computeFillRate(sessions: GrowthData["sessions"]) {
  const usable = sessions.filter((s) => s.isPast && s.capacity != null && s.capacity > 0);
  const excluded = sessions.filter((s) => s.isPast && (s.capacity == null || s.capacity === 0)).length;
  const bucket = (keyOf: (d: string) => string, meta?: Map<string, string>) => {
    const m = new Map<string, { spots: number; cap: number; sessions: number }>();
    for (const s of usable) {
      const k = keyOf(s.dateIso);
      const e = m.get(k) ?? { spots: 0, cap: 0, sessions: 0 };
      e.spots += s.bookedSpots; e.cap += s.capacity!; e.sessions++;
      m.set(k, e);
    }
    return { m, meta };
  };
  const weekMeta = new Map<string, string>();
  const weekly = bucket((d) => { const w = isoWeekOf(d); weekMeta.set(w.label, w.weekStart); return w.label; }).m;
  const monthly = bucket(month).m;
  const pct = (e: { spots: number; cap: number }) => (e.cap ? Math.round((e.spots / e.cap) * 1000) / 10 : 0);
  return {
    excludedNullCapacity: excluded,
    perSession: usable.sort((a, b) => a.dateIso.localeCompare(b.dateIso))
      .map((s) => ({ date: s.dateIso, booked: s.bookedSpots, capacity: s.capacity!, pct: Math.round((s.bookedSpots / s.capacity!) * 1000) / 10 })),
    weekly: Array.from(weekly.entries()).sort((a, b) => weekMeta.get(a[0])!.localeCompare(weekMeta.get(b[0])!))
      .map(([label, e]) => ({ label, sessions: e.sessions, booked: e.spots, capacity: e.cap, pct: pct(e) })),
    monthly: Array.from(monthly.entries()).sort().map(([m, e]) => ({ month: m, sessions: e.sessions, booked: e.spots, capacity: e.cap, pct: pct(e) })),
  };
}

// ── 8. Profit-based LTV (BOOKING basis: per-seat over paid/confirmed spots,
//       guests → booker; attendance plays no role) ────────────────────────────
export function computeLtv(
  seatRows: AttendanceRow[], // confirmed/attended booking seats
  valueProfitFilsBySession: Map<string, number>,
) {
  // per-seat = session valueProfit ÷ Σ booked spots; booker += their spots × per-seat
  const spotsBySession = new Map<string, number>();
  for (const a of seatRows) spotsBySession.set(a.sessionId, (spotsBySession.get(a.sessionId) ?? 0) + a.spotsBooked);

  const users = new Map<string, { name: string; sessions: Set<string>; ltvFils: number }>();
  for (const a of seatRows) {
    const profit = valueProfitFilsBySession.get(a.sessionId);
    const totalSpots = spotsBySession.get(a.sessionId)!;
    if (profit == null) continue; // no profit row → contributes nothing, never guessed
    let u = users.get(a.userId);
    if (!u) { u = { name: a.userName, sessions: new Set(), ltvFils: 0 }; users.set(a.userId, u); }
    u.sessions.add(a.sessionId);
    u.ltvFils += (profit / totalSpots) * a.spotsBooked;
  }
  return {
    players: Array.from(users.values())
      .map((u) => ({ name: u.name, sessions: u.sessions.size, ltvFils: Math.round(u.ltvFils) }))
      .sort((a, b) => b.ltvFils - a.ltvFils),
  };
}

// ── assemble everything for the endpoint ──────────────────────────────────────
export async function buildGrowthReport(lapsedDays: number, todayIso: string) {
  const data = await loadGrowthData();
  const profits = await computeSessionProfitsBatchFils(data.sessions.map((s) => s.sessionId));
  const valueProfitBySession = new Map(
    Array.from(profits.entries()).map(([id, p]) => [id, p.valueProfitFils]));
  return {
    definitions: {
      epoch: PORTAL_EPOCH_ISO,
      attendance: "attended_at IS NOT NULL",
      ltv: "based on paid bookings: session value-profit ÷ confirmed booked spots; guest seats attributed to the booker; attendance plays no role",
    },
    repeatRate: computeRepeatRate(data.attendance),
    retention: computeThirdSessionRetention(data.attendance),
    lapsed: { days: lapsedDays, players: computeLapsed(data.attendance, todayIso, lapsedDays) },
    growth: { ...computeGrowth(data.signups, data.bookingsCreated), preJuneSignups: data.preJuneSignups },
    referrals: { ...computeReferrals(data.referrals), preJuneCompleted: data.preJuneCompletedReferrals },
    womens: computeWomens(data.attendance),
    fillRate: computeFillRate(data.sessions),
    ltv: computeLtv(data.bookingSeats, valueProfitBySession),
  };
}
