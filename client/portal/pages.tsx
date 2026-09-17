import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

// Every scrolling table goes through here: the scrollbar stays visible (portal.css)
// and a fade marks whichever edge still hides columns — measured, so a table that
// fits shows nothing at all.
export function TableWrap({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [clip, setClip] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    const left = el.scrollLeft > 1;
    setClip((c) => (c.left === left && c.right === right ? c : { left, right }));
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);
  return (
    <div className={`tablewrap-shell${clip.right ? " clip-right" : ""}${clip.left ? " clip-left" : ""}`}>
      <div className="tablewrap" ref={ref} onScroll={measure}>{children}</div>
    </div>
  );
}
function Amount({ value }: { value: number }) {
  return <span className={value < 0 ? "amt neg" : "amt"}>{fmtAed(value)}</span>;
}

interface PnlRow {
  collectedRevenueAed: number;
  sessionCostsAed: number;
  generalExpensesAed: number;
  netProfitAed: number;           // BEFORE runner pay
  runnerPayAed?: number;          // monthly P&L only — accrued, assigned runners only
  socialMediaPayAed?: number;     // monthly P&L only — 15% of collected session profit
  managementProfitAed?: number;   // monthly P&L only — net − runner pay − social media
  walletPaidAed?: number; // monthly P&L only — informational, not in the net formula
  iqPassRevenueAed?: number;      // monthly P&L only — IQ Pass sales by purchase month, informational
  iqPassByTierAed?: { club: number; club_plus: number; club_elite: number };
}

const WALLET_FOOTNOTE = "Wallet-paid spots were collected when the credit was originally issued.";

// ── P&L ───────────────────────────────────────────────────────────────────────
export function PnlPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<{ months: Array<{ month: string } & PnlRow> }>(
    "/api/portal/finance/pnl", token, onAuthFail,
  );
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;
  return (
    <div className="report">
      <p className="formula">Collected revenue − Session costs − General expenses = Net profit − Runner pay − Social media = Management profit</p>
      <p className="note">June 2026 onwards. Revenue is attributed to the session's date and netted of refunds.</p>
      <TableWrap>
        <table className="pnl">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Collected</th>
              <th className="num">Session costs</th>
              <th className="num">Expenses</th>
              <th className="num">Net profit</th>
              <th className="num">−&nbsp;Runner pay</th>
              <th className="num">−&nbsp;Social 15%</th>
              <th className="num">Management profit</th>
              <th className="num">Wallet (info)</th>
              <th className="num">IQ Pass (info)</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => {
              const tiers = m.iqPassByTierAed ?? { club: 0, club_plus: 0, club_elite: 0 };
              return (
                <Fragment key={m.month}>
                  <tr className="has-caption">
                    <td>{fmtMonth(m.month)}</td>
                    <td className="num"><Amount value={m.collectedRevenueAed} /></td>
                    <td className="num"><Amount value={m.sessionCostsAed} /></td>
                    <td className="num"><Amount value={m.generalExpensesAed} /></td>
                    <td className="num"><Amount value={m.netProfitAed} /></td>
                    <td className="num"><Amount value={m.runnerPayAed ?? 0} /></td>
                    <td className="num"><Amount value={m.socialMediaPayAed ?? 0} /></td>
                    <td className="num strong"><Amount value={m.managementProfitAed ?? m.netProfitAed} /></td>
                    <td className="num"><Amount value={m.walletPaidAed ?? 0} /></td>
                    <td className="num" data-testid={`cell-iqpass-${m.month}`}><Amount value={m.iqPassRevenueAed ?? 0} /></td>
                  </tr>
                  {/* The IQ Pass split by tier, as text the eye can read on any device (was a hover tooltip). */}
                  <tr className="caption-row">
                    <td colSpan={10} className="num caption" data-testid={`text-iqpass-tiers-${m.month}`}>
                      Club {fmtAed(tiers.club)} · Plus {fmtAed(tiers.club_plus)} · Elite {fmtAed(tiers.club_elite)}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="note footnote">
        {WALLET_FOOTNOTE} Wallet-paid amounts are informational and not part of the net formula.
        IQ Pass sales are informational too: each pass is already inside Collected revenue as its
        games' per-seat share on the session dates (the split by tier sits under each month).
        Runner pay is ACCRUED (owed, 25% of session-value profit) for assigned runners only —
        sessions without a captain pay nobody and their profit stays with management.
      </p>
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
      <TableWrap>
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
      </TableWrap>
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
  walletPaidAed: number;
  courtAed: number;
  shuttleAed: number;
  waterAed: number;
  profitAed: number;
  iqPassSeats: number; // IQ Pass card: seats a pass paid for (inside Collected)
  iqPassAed: number;   // their per-seat allocation
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
      <TableWrap>
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
              <th className="num">Wallet-paid</th>
              <th className="num">IQ Pass</th>
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
                <td className="num"><Amount value={r.walletPaidAed} /></td>
                <td className="num" data-testid={`iqpass-session-${r.sessionId}`}>
                  {r.iqPassSeats > 0 ? (
                    <span className="iqcard">
                      <span>{r.iqPassSeats} {r.iqPassSeats === 1 ? "seat" : "seats"}</span>
                      <span className="sub">AED {fmtAed(r.iqPassAed)}</span>
                    </span>
                  ) : "—"}
                </td>
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
              <td className="num"><Amount value={sum((r) => r.walletPaidAed)} /></td>
              <td className="num" data-testid="iqpass-total">
                {sum((r) => r.iqPassSeats)} seats
                <span className="sub">AED {fmtAed(sum((r) => r.iqPassAed))}</span>
              </td>
              <td className="num"><Amount value={sum((r) => r.courtAed)} /></td>
              <td className="num"><Amount value={sum((r) => r.shuttleAed)} /></td>
              <td className="num"><Amount value={sum((r) => r.waterAed)} /></td>
              <td className="num strong"><Amount value={sum((r) => r.profitAed)} /></td>
            </tr>
          </tfoot>
        </table>
      </TableWrap>
      <p className="note footnote">
        {WALLET_FOOTNOTE} Profit stays on the collected basis. IQ Pass shows the seats a pass paid
        for and their per-seat allocation — that money is inside Collected, which is why runner pay counts it.
      </p>
    </div>
  );
}

// ── Social media pay ──────────────────────────────────────────────────────────
interface SocialMediaPayData {
  weeks: Array<{
    isoWeek: string;
    label: string;
    weekStart: string;
    weekEnd: string;
    socialMediaPayAed: number;
  }>;
}

export function SocialMediaPayPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<SocialMediaPayData>(
    "/api/portal/finance/social-media-pay", token, onAuthFail,
  );
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;
  return (
    <div className="report">
      <p className="note">
        15% of each session's collected profit, zero-floored per session, sessions from Mon 27 Jul 2026 onward.
      </p>
      {data.weeks.length === 0 && <p className="note">No qualifying weeks yet.</p>}
      {data.weeks.map((w) => (
        <div className="payweek" key={w.label}>
          <h3>
            {w.label}
            <span className="sub">{fmtDay(w.weekStart)} – {fmtDay(w.weekEnd)}</span>
          </h3>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="num">15% share</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{fmtDay(w.weekStart)} – {fmtDay(w.weekEnd)}</td>
                  <td className="num strong"><Amount value={w.socialMediaPayAed} /></td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </div>
      ))}
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
      sessions: Array<{
        date: string;
        venue: string;
        valueAed: number;
        walletPaidAed: number;
        unpaidCashAed: number;
        valueProfitAed: number;
        payAed: number;
      }>;
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
      <p className="note">
        25% of each session's session-value profit, zero-floored per session, grouped by ISO week and runner.
        Session value = collected + wallet-paid, net of refunds. Unpaid cash is excluded from the basis and flagged.
      </p>
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
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Venue</th>
                      <th className="num">Value basis</th>
                      <th className="num">of which wallet</th>
                      <th className="num">Value profit</th>
                      <th className="num">25% share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.sessions.map((s) => (
                      <tr key={`${s.date}-${s.venue}`}>
                        <td>{fmtDay(s.date)}</td>
                        <td>
                          {s.venue}
                          {s.unpaidCashAed > 0 && (
                            <span className="sub flag">excl. unpaid cash AED {fmtAed(s.unpaidCashAed)}</span>
                          )}
                        </td>
                        <td className="num"><Amount value={s.valueAed} /></td>
                        <td className="num"><Amount value={s.walletPaidAed} /></td>
                        <td className="num"><Amount value={s.valueProfitAed} /></td>
                        <td className="num strong"><Amount value={s.payAed} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}
