import { useEffect, useState } from "react";
import { fmtAed } from "./pages";

// Phase 5 — growth reports. One fetch, eight sub-tabs. Every metric states its own
// date-range/definition line so the numbers are self-explanatory.

type SubKey = "repeat" | "retention" | "lapsed" | "growth" | "referrals" | "womens" | "fill" | "ltv";
const SUBS: Array<{ key: SubKey; title: string }> = [
  { key: "repeat", title: "Repeat rate" },
  { key: "retention", title: "3rd-session retention" },
  { key: "lapsed", title: "Lapsed players" },
  { key: "growth", title: "Signups & bookings" },
  { key: "referrals", title: "Referrals" },
  { key: "womens", title: "Women's participation" },
  { key: "fill", title: "Fill rate" },
  { key: "ltv", title: "Profit LTV" },
];

interface Report {
  definitions: { epoch: string; attendance: string; ltv: string };
  repeatRate: {
    playersWithAttendance: number; ge2: number; ge3: number; ge5: number;
    pct2: number; pct3: number; pct5: number;
    distribution: Array<{ sessions: number; players: number }>;
  };
  retention: Array<{ month: string; cohortSize: number; reached3: number; pct: number }>;
  lapsed: { days: number; players: Array<{ name: string; lastSessionDate: string; lifetimeSessions: number }> };
  growth: {
    signups: { weekly: Array<{ label: string; count: number }>; monthly: Array<{ month: string; count: number }> };
    bookings: { weekly: Array<{ label: string; count: number }>; monthly: Array<{ month: string; count: number }> };
    preJuneSignups: number;
  };
  referrals: { totals: Array<{ status: string; count: number }>; completedMonthly: Array<{ month: string; count: number }>; preJuneCompleted: number };
  womens: {
    unknownGenderPlayers: number;
    monthly: Array<{ month: string; uniquePlayers: number; femalePlayers: number; pctPlayers: number; attendances: number; femaleAttendances: number; pctAttendances: number }>;
  };
  fillRate: {
    excludedNullCapacity: number;
    perSession: Array<{ date: string; booked: number; capacity: number; pct: number }>;
    weekly: Array<{ label: string; sessions: number; booked: number; capacity: number; pct: number }>;
    monthly: Array<{ month: string; sessions: number; booked: number; capacity: number; pct: number }>;
  };
  ltv: { players: Array<{ name: string; sessions: number; ltvFils: number }> };
}

const ATT_DEF = "Since June 2026 · attendance = check-in stamp (attended_at set)";

export function GrowthPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const [sub, setSub] = useState<SubKey>("repeat");
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setReport(null); setError(null);
    fetch(`/api/portal/growth?lapsedDays=${days}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.status === 401) { onAuthFail(); return; }
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (alive) setReport(data);
      })
      .catch(() => { if (alive) setError("Couldn't load growth reports. Try again."); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, days]);

  if (error) return <div className="report"><div className="error">{error}</div></div>;
  if (!report) return <div className="report"><div className="skeleton wide" /></div>;
  const r = report;

  return (
    <div className="report">
      <nav className="tabs subtabs">
        {SUBS.map((s) => (
          <button key={s.key} className={sub === s.key ? "tab active" : "tab"} onClick={() => setSub(s.key)}>
            {s.title}
          </button>
        ))}
      </nav>

      {sub === "repeat" && (
        <>
          <p className="note">{ATT_DEF}. Sessions counted per player = distinct attended sessions.</p>
          <p className="formula">
            {r.repeatRate.playersWithAttendance} players attended ≥1 ·
            {" "}≥2: {r.repeatRate.ge2} ({r.repeatRate.pct2}%) ·
            {" "}≥3: {r.repeatRate.ge3} ({r.repeatRate.pct3}%) ·
            {" "}≥5: {r.repeatRate.ge5} ({r.repeatRate.pct5}%)
          </p>
          <div className="tablewrap"><table>
            <thead><tr><th className="num">Sessions attended</th><th className="num">Players</th></tr></thead>
            <tbody>{r.repeatRate.distribution.map((d) => (
              <tr key={d.sessions}><td className="num">{d.sessions}</td><td className="num">{d.players}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {sub === "retention" && (
        <>
          <p className="note">{ATT_DEF}. Cohort = month of a player's FIRST attended session; reached 3rd = attended ≥3 sessions to date. Young cohorts can still improve.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>First-session month</th><th className="num">Cohort</th><th className="num">Reached 3rd</th><th className="num">%</th></tr></thead>
            <tbody>{r.retention.map((c) => (
              <tr key={c.month}><td>{c.month}</td><td className="num">{c.cohortSize}</td><td className="num">{c.reached3}</td><td className="num strong">{c.pct}%</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {sub === "lapsed" && (
        <>
          <p className="note">
            {ATT_DEF}. Attended before but not in the last{" "}
            <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
              {[14, 21, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>{" "}days.
          </p>
          <p className="formula">{r.lapsed.players.length} lapsed players (cutoff {r.lapsed.days} days)</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Player</th><th>Last session</th><th className="num">Lifetime sessions</th></tr></thead>
            <tbody>{r.lapsed.players.map((p, i) => (
              <tr key={i}><td>{p.name}</td><td>{p.lastSessionDate}</td><td className="num">{p.lifetimeSessions}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {sub === "growth" && (
        <>
          <p className="note">Since June 2026. Signups = new marketplace accounts (created date); bookings = confirmed/attended bookings by booking date. {r.growth.preJuneSignups} accounts predate June and are excluded.</p>
          <div className="growth-cols">
            <div className="tablewrap"><table>
              <thead><tr><th>Month</th><th className="num">Signups</th><th className="num">Bookings</th></tr></thead>
              <tbody>{r.growth.signups.monthly.map((m) => (
                <tr key={m.month}><td>{m.month}</td><td className="num">{m.count}</td>
                  <td className="num">{r.growth.bookings.monthly.find((b) => b.month === m.month)?.count ?? 0}</td></tr>
              ))}</tbody>
            </table></div>
            <div className="tablewrap"><table>
              <thead><tr><th>ISO week</th><th className="num">Signups</th><th className="num">Bookings</th></tr></thead>
              <tbody>{r.growth.bookings.weekly.map((w) => (
                <tr key={w.label}><td>{w.label}</td>
                  <td className="num">{r.growth.signups.weekly.find((s) => s.label === w.label)?.count ?? 0}</td>
                  <td className="num">{w.count}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        </>
      )}

      {sub === "referrals" && (
        <>
          <p className="note">Completed referrals by completion month, June 2026 onward ({r.referrals.preJuneCompleted} completed pre-June, excluded from the trend). Totals cover all time.</p>
          <p className="formula">{r.referrals.totals.map((t) => `${t.status}: ${t.count}`).join(" · ")}</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Month</th><th className="num">Completed referrals</th></tr></thead>
            <tbody>{r.referrals.completedMonthly.map((m) => (
              <tr key={m.month}><td>{m.month}</td><td className="num">{m.count}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {sub === "womens" && (
        <>
          <p className="note">{ATT_DEF}. Gender via the player profile linked to each account{r.womens.unknownGenderPlayers > 0 ? ` (${r.womens.unknownGenderPlayers} attendee(s) have no linked profile and are excluded from the player %)` : " (all attendees have linked profiles)"}. Attendances count booked seats incl. guests.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Month</th><th className="num">Players</th><th className="num">Women</th><th className="num">% players</th><th className="num">Attendances</th><th className="num">By women</th><th className="num">% attendances</th></tr></thead>
            <tbody>{r.womens.monthly.map((m) => (
              <tr key={m.month}><td>{m.month}</td><td className="num">{m.uniquePlayers}</td><td className="num">{m.femalePlayers}</td><td className="num strong">{m.pctPlayers}%</td>
                <td className="num">{m.attendances}</td><td className="num">{m.femaleAttendances}</td><td className="num strong">{m.pctAttendances}%</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {sub === "fill" && (
        <>
          <p className="note">Since June 2026, PAST sessions only (upcoming ones are still selling). Fill = booked seats (confirmed/attended bookings) ÷ capacity.{r.fillRate.excludedNullCapacity > 0 ? ` ${r.fillRate.excludedNullCapacity} session(s) without capacity excluded.` : " No sessions lack capacity."}</p>
          <div className="growth-cols">
            <div className="tablewrap"><table>
              <thead><tr><th>Month</th><th className="num">Sessions</th><th className="num">Booked</th><th className="num">Capacity</th><th className="num">Fill</th></tr></thead>
              <tbody>{r.fillRate.monthly.map((m) => (
                <tr key={m.month}><td>{m.month}</td><td className="num">{m.sessions}</td><td className="num">{m.booked}</td><td className="num">{m.capacity}</td><td className="num strong">{m.pct}%</td></tr>
              ))}</tbody>
            </table></div>
            <div className="tablewrap"><table>
              <thead><tr><th>Session</th><th className="num">Booked</th><th className="num">Capacity</th><th className="num">Fill</th></tr></thead>
              <tbody>{r.fillRate.perSession.map((s) => (
                <tr key={s.date}><td>{s.date}</td><td className="num">{s.booked}</td><td className="num">{s.capacity}</td><td className="num">{s.pct}%</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        </>
      )}

      {sub === "ltv" && (
        <>
          <p className="note">Since June 2026 · based on paid bookings (confirmed, incl. wallet-paid) — attendance plays no role. LTV = Σ over a player's booked sessions of (session value-profit ÷ total booked seats) × their booked seats — guest seats attributed to the booker. Profit reuses the locked per-session definition (collected + wallet − refunds − costs, zero-floored).</p>
          <div className="tablewrap"><table>
            <thead><tr><th>Player</th><th className="num">Sessions</th><th className="num">Profit LTV (AED)</th></tr></thead>
            <tbody>{r.ltv.players.map((p, i) => (
              <tr key={i}><td>{p.name}</td><td className="num">{p.sessions}</td><td className="num strong">{fmtAed(Math.round(p.ltvFils) / 100)}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
