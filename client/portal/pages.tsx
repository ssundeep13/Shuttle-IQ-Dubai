import { useEffect, useState } from "react";

// AED display: thousands separators; decimals only when there are nonzero fils.
export function fmtAed(n: number): string {
  return n.toLocaleString(
    "en-US",
    Number.isInteger(n)
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );
}

// "2026-06" → "June 2026"
function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${y}`;
}

// "2026-06-02" → "Tue 2 Jun"
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Authenticated GET against /api/portal/*; a 401 bubbles up as a logout.
function usePortalGet<T>(path: string, token: string, onAuthFail: () => void): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: null });
    fetch(path, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.status === 401) { onAuthFail(); return; }
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as T;
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch(() => {
        if (alive) setState({ data: null, loading: false, error: "Couldn't load this report. Try again." });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, token]);
  return state;
}

function Loading() {
  return <div className="skeleton wide" />;
}
function LoadError({ message }: { message: string }) {
  return <div className="error">{message}</div>;
}
function Amount({ value }: { value: number }) {
  return <span className={value < 0 ? "amt neg" : "amt"}>{fmtAed(value)}</span>;
}

interface PnlRow {
  collectedRevenueAed: number;
  sessionCostsAed: number;
  generalExpensesAed: number;
  netProfitAed: number;
}

// ── P&L ───────────────────────────────────────────────────────────────────────
export function PnlPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<{ months: Array<{ month: string } & PnlRow> }>(
    "/api/portal/finance/pnl", token, onAuthFail,
  );
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;
  return (
    <div className="report">
      <p className="formula">Collected revenue − Session costs − General expenses = Net profit</p>
      <p className="note">June 2026 onwards. Revenue is attributed to the session's date and netted of refunds.</p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Collected revenue</th>
              <th className="num">Session costs</th>
              <th className="num">General expenses</th>
              <th className="num">Net profit</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month}>
                <td>{fmtMonth(m.month)}</td>
                <td className="num"><Amount value={m.collectedRevenueAed} /></td>
                <td className="num"><Amount value={m.sessionCostsAed} /></td>
                <td className="num"><Amount value={m.generalExpensesAed} /></td>
                <td className="num strong"><Amount value={m.netProfitAed} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Weekly ────────────────────────────────────────────────────────────────────
export function WeeklyPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<{
    weeks: Array<{ label: string; weekStart: string; weekEnd: string } & PnlRow>;
  }>("/api/portal/finance/weekly", token, onAuthFail);
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;
  return (
    <div className="report">
      <p className="note">ISO weeks (Monday–Sunday), June 2026 onwards.</p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th className="num">Collected revenue</th>
              <th className="num">Session costs</th>
              <th className="num">General expenses</th>
              <th className="num">Net profit</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.label}>
                <td>
                  {w.label}
                  <span className="sub">{fmtDay(w.weekStart)} – {fmtDay(w.weekEnd)}</span>
                </td>
                <td className="num"><Amount value={w.collectedRevenueAed} /></td>
                <td className="num"><Amount value={w.sessionCostsAed} /></td>
                <td className="num"><Amount value={w.generalExpensesAed} /></td>
                <td className="num strong"><Amount value={w.netProfitAed} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sessions (the reconciliation workhorse) ───────────────────────────────────
interface SessionRow {
  sessionId: string;
  date: string;
  venue: string;
  captain: string;
  collectedAed: number;
  courtAed: number;
  shuttleAed: number;
  waterAed: number;
  profitAed: number;
}

export function SessionsPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<{ sessions: SessionRow[] }>(
    "/api/portal/finance/sessions", token, onAuthFail,
  );
  const [desc, setDesc] = useState(true);
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;
  const rows = [...data.sessions].sort((a, b) =>
    desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
  );
  const sum = (f: (r: SessionRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return (
    <div className="report">
      <p className="note">Per-session collected revenue, costs and profit, June 2026 onwards. Profit is zero-floored per session.</p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>
                <button className="sortbtn" onClick={() => setDesc(!desc)}>
                  Date {desc ? "(newest first)" : "(oldest first)"}
                </button>
              </th>
              <th>Venue</th>
              <th>Captain</th>
              <th className="num">Collected</th>
              <th className="num">Court</th>
              <th className="num">Shuttle</th>
              <th className="num">Water</th>
              <th className="num">Profit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sessionId}>
                <td>{fmtDay(r.date)}</td>
                <td>{r.venue}</td>
                <td>{r.captain}</td>
                <td className="num"><Amount value={r.collectedAed} /></td>
                <td className="num"><Amount value={r.courtAed} /></td>
                <td className="num"><Amount value={r.shuttleAed} /></td>
                <td className="num"><Amount value={r.waterAed} /></td>
                <td className="num strong"><Amount value={r.profitAed} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total ({rows.length} sessions)</td>
              <td className="num"><Amount value={sum((r) => r.collectedAed)} /></td>
              <td className="num"><Amount value={sum((r) => r.courtAed)} /></td>
              <td className="num"><Amount value={sum((r) => r.shuttleAed)} /></td>
              <td className="num"><Amount value={sum((r) => r.waterAed)} /></td>
              <td className="num strong"><Amount value={sum((r) => r.profitAed)} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Runner pay ────────────────────────────────────────────────────────────────
interface RunnerPayData {
  weeks: Array<{
    label: string;
    weekStart: string;
    weekEnd: string;
    runners: Array<{
      runnerName: string;
      totalPayAed: number;
      sessions: Array<{ date: string; venue: string; profitAed: number; payAed: number }>;
    }>;
  }>;
}

export function RunnerPayPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<RunnerPayData>(
    "/api/portal/finance/runner-pay", token, onAuthFail,
  );
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;
  return (
    <div className="report">
      <p className="note">25% of each session's profit (zero-floored per session), grouped by ISO week and runner.</p>
      {data.weeks.map((w) => (
        <div className="payweek" key={w.label}>
          <h3>
            {w.label}
            <span className="sub">{fmtDay(w.weekStart)} – {fmtDay(w.weekEnd)}</span>
          </h3>
          {w.runners.map((r) => (
            <details className="runner" key={r.runnerName}>
              <summary>
                <span>{r.runnerName}</span>
                <span className="runner-total">AED <Amount value={r.totalPayAed} /></span>
              </summary>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Venue</th>
                      <th className="num">Session profit</th>
                      <th className="num">25% share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.sessions.map((s) => (
                      <tr key={`${s.date}-${s.venue}`}>
                        <td>{fmtDay(s.date)}</td>
                        <td>{s.venue}</td>
                        <td className="num"><Amount value={s.profitAed} /></td>
                        <td className="num strong"><Amount value={s.payAed} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}
