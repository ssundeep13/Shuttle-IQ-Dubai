// Finance portal — the IQ Pass tab (owner-only). Summary strip, one row per paid pack
// (newest first) that expands into its picked sessions, holds in a collapsed section,
// tier / status / purchase-month filters and a CSV of the current view. All data comes
// from GET /api/portal/iq-pass; nothing here writes.
import { Fragment, useState } from "react";
import { TableWrap, fmtAed, fmtDay, usePortalGet, Loading, LoadError } from "./pages";

export interface IqPassSeatView {
  bookingId: string; sessionId: string; date: string; startTime: string; venue: string; state: string; stateLabel: string;
}
export interface IqPassPackView {
  packId: string; playerName: string; playerEmail: string; tier: string; tierLabel: string; priceAed: number;
  paidAt: string | null; paidAtDubai: string | null; createdAt: string; createdAtDubai?: string | null; purchaseMonth: string; ziinaRef: string | null;
  gamesTotal: number; gamesPicked: number; gamesPlayed: number; gamesRemaining: number; repickCredits: number;
  windowStart: string; windowEnd: string; firstGame: string | null; lastGame: string | null;
  status: string; statusLabel: string; holdExpiresAt: string | null; holdExpiresDubai: string | null;
  jerseySize: string | null; jerseyHandedOverAt: string | null; jerseyHandedOverDubai?: string | null; jerseyOwed: boolean;
  seats: IqPassSeatView[];
}
export interface IqPassReport {
  summary: {
    sold: number; soldByTier: { club: number; club_plus: number; club_elite: number };
    revenueAed: number; revenueAedByTier: { club: number; club_plus: number; club_elite: number };
    active: number; completed: number; expired: number; pendingHolds: number; cancelledHolds: number; jerseysOwed: number;
  };
  packs: IqPassPackView[];
  holds: IqPassPackView[];
}
export interface IqPassFilters { tier: string; status: string; month: string }

const TIERS = [["club", "Club"], ["club_plus", "Club Plus"], ["club_elite", "Club Elite"]] as const;
const STATUSES = [
  ["active", "Active"], ["completed", "Completed"], ["expired", "Expired"],
  ["pending_payment", "Pending payment"], ["cancelled_hold", "Cancelled hold"], ["cancelled", "Cancelled"],
] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-13" → "13 Oct" (our own month names: deterministic across ICU versions)
function shortDate(ymd: string | null): string {
  if (!ymd) return "—";
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m ? `${MONTHS_LONG[m - 1]} ${y}` : ym;
}

export function applyIqPassFilters<T extends Pick<IqPassPackView, "tier" | "status" | "purchaseMonth">>(rows: T[], f: IqPassFilters): T[] {
  return rows.filter((r) =>
    (f.tier === "all" || r.tier === f.tier) &&
    (f.status === "all" || r.status === f.status) &&
    (f.month === "all" || r.purchaseMonth === f.month),
  );
}

const CSV_HEADER = [
  "Player", "Email", "Tier", "Price AED", "Paid at (Dubai)", "Ziina ref", "Games total", "Picked", "Played", "Remaining", "Re-pick credits",
  "Window start", "Window end", "First game", "Last game", "Status", "Jersey size", "Jersey handed over", "Hold expires (Dubai)",
];
const csvCell = (v: unknown): string => (v === null || v === undefined ? '""' : typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
export function iqPassCsv(rows: IqPassPackView[]): string {
  return [
    CSV_HEADER.join(","),
    ...rows.map((p) => [
      p.playerName, p.playerEmail, p.tierLabel, p.priceAed, p.paidAtDubai, p.ziinaRef, p.gamesTotal, p.gamesPicked, p.gamesPlayed, p.gamesRemaining,
      p.repickCredits, p.windowStart, p.windowEnd, p.firstGame, p.lastGame, p.statusLabel, p.jerseySize, p.jerseyHandedOverDubai ?? p.jerseyHandedOverAt, p.holdExpiresDubai,
    ].map(csvCell).join(",")),
  ].join("\n");
}

function downloadCsv(text: string, filename: string): void {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SeatsTable({ pack }: { pack: IqPassPackView }) {
  return (
    <div className="seats-wrap" data-testid={`seats-${pack.packId}`}>
      {pack.seats.length === 0 ? (
        <p className="note">No sessions picked.</p>
      ) : (
        <table className="seats">
          <thead><tr><th>Session</th><th>Venue</th><th>Status</th></tr></thead>
          <tbody>
            {pack.seats.map((s) => (
              <tr key={s.bookingId}>
                <td>{fmtDay(s.date)} · {s.startTime}</td>
                <td>{s.venue}</td>
                <td><span className={`pill seat-${s.state}`}>{s.stateLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function jerseyText(p: IqPassPackView): string {
  if (p.tier !== "club_elite") return "—";
  const size = p.jerseySize ?? "size not entered";
  if (p.status === "pending_payment" || p.status === "cancelled_hold") return size;
  return `${size} · ${p.jerseyHandedOverAt ? "handed over" : "owed"}`;
}

export function IqPassPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const { data, loading, error } = usePortalGet<IqPassReport>("/api/portal/iq-pass", token, onAuthFail);
  const [filters, setFilters] = useState<IqPassFilters>({ tier: "all", status: "all", month: "all" });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (loading) return <Loading />;
  if (error || !data) return <LoadError message={error ?? "No data."} />;

  const s = data.summary;
  const months = Array.from(new Set([...data.packs, ...data.holds].map((p) => p.purchaseMonth).filter(Boolean))).sort().reverse();
  const rows = applyIqPassFilters(data.packs, filters);
  const holds = applyIqPassFilters(data.holds, filters);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const set = (k: keyof IqPassFilters) => (e: React.ChangeEvent<HTMLSelectElement>) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const exportCsv = () => downloadCsv(iqPassCsv([...rows, ...holds]), `iq-pass-${new Date().toISOString().slice(0, 10)}.csv`);
  const gamesText = (p: IqPassPackView) => `${p.gamesPicked} picked · ${p.gamesPlayed} played · ${p.gamesRemaining} remaining`;

  return (
    <div className="report">
      <p className="note">Every IQ Pass, newest first. Purchase time and hold expiry are Dubai time; games follow the player's own pass line (played = session over, remaining = still ahead).</p>
      <div className="strip">
        <div className="tile" data-testid="strip-sold">
          <span className="label">Passes sold</span>
          <span className="value">{s.sold}</span>
          <span className="sub">Club {s.soldByTier.club} · Plus {s.soldByTier.club_plus} · Elite {s.soldByTier.club_elite}</span>
        </div>
        <div className="tile" data-testid="strip-revenue">
          <span className="label">Revenue</span>
          <span className="value">AED {fmtAed(s.revenueAed)}</span>
          <span className="sub">Club {fmtAed(s.revenueAedByTier.club)} · Plus {fmtAed(s.revenueAedByTier.club_plus)} · Elite {fmtAed(s.revenueAedByTier.club_elite)}</span>
        </div>
        <div className="tile" data-testid="strip-active"><span className="label">Active</span><span className="value">{s.active}</span><span className="sub">games still ahead</span></div>
        <div className="tile" data-testid="strip-completed"><span className="label">Completed</span><span className="value">{s.completed}</span><span className="sub">last game played</span></div>
        <div className="tile" data-testid="strip-expired"><span className="label">Expired</span><span className="value">{s.expired}</span><span className="sub">window closed</span></div>
        <div className="tile" data-testid="strip-jerseys"><span className="label">Jerseys owed</span><span className="value">{s.jerseysOwed}</span><span className="sub">Elite, not handed over</span></div>
      </div>

      <div className="filters">
        <label>Tier
          <select data-testid="select-tier" value={filters.tier} onChange={set("tier")}>
            <option value="all">All</option>
            {TIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Status
          <select data-testid="select-status" value={filters.status} onChange={set("status")}>
            <option value="all">All</option>
            {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Bought
          <select data-testid="select-month" value={filters.month} onChange={set("month")}>
            <option value="all">Any month</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <span data-testid="text-view-count">{rows.length} of {data.packs.length} passes{holds.length ? ` · ${holds.length} of ${data.holds.length} holds` : ""}</span>
        <span className="spacer" />
        <button type="button" className="btn-navy" data-testid="button-export-csv" onClick={exportCsv}>Export CSV</button>
      </div>

      <TableWrap>
        <table data-testid="table-packs">
          <thead>
            <tr>
              <th>Player</th>
              <th>Tier</th>
              <th className="num">Paid</th>
              <th>Paid at (Dubai)</th>
              <th>Ziina ref</th>
              <th>Games</th>
              <th>Window</th>
              <th>Status</th>
              <th>Jersey</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="note">No passes match these filters.</td></tr>}
            {rows.map((p) => (
              <Fragment key={p.packId}>
                <tr className={`expandable${open[p.packId] ? " open" : ""}`} data-testid={`row-pack-${p.packId}`} onClick={() => toggle(p.packId)}>
                  <td>{p.playerName}<span className="sub">{p.playerEmail}</span></td>
                  <td>{p.tierLabel}</td>
                  <td className="num">{fmtAed(p.priceAed)}</td>
                  <td>{p.paidAtDubai ?? "—"}</td>
                  <td className="mono">{p.ziinaRef ?? "—"}</td>
                  <td>{gamesText(p)}<span className="sub">of {p.gamesTotal}{p.repickCredits > 0 ? ` · ${p.repickCredits} re-pick credit${p.repickCredits === 1 ? "" : "s"}` : ""}</span></td>
                  <td>{p.firstGame ? `${shortDate(p.firstGame)} – ${shortDate(p.lastGame)}` : "—"}<span className="sub">pass window to {shortDate(p.windowEnd)}</span></td>
                  <td><span className={`pill ${p.status}`}>{p.statusLabel}</span></td>
                  <td>{jerseyText(p)}</td>
                </tr>
                {open[p.packId] && (
                  <tr className="expand-row"><td colSpan={9}><SeatsTable pack={p} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <details className="holds" data-testid="details-holds">
        <summary>Holds ({holds.length}) — pending payment or cancelled before paying</summary>
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Tier</th>
                <th className="num">Price</th>
                <th>Started (Dubai)</th>
                <th>Ziina ref</th>
                <th>Seats held</th>
                <th>Status</th>
                <th>Jersey</th>
              </tr>
            </thead>
            <tbody>
              {holds.length === 0 && <tr><td colSpan={8} className="note">No holds.</td></tr>}
              {holds.map((p) => (
                <Fragment key={p.packId}>
                  <tr className={`expandable${open[p.packId] ? " open" : ""}`} data-testid={`row-hold-${p.packId}`} onClick={() => toggle(p.packId)}>
                    <td>{p.playerName}<span className="sub">{p.playerEmail}</span></td>
                    <td>{p.tierLabel}</td>
                    <td className="num">{fmtAed(p.priceAed)}</td>
                    <td>{p.createdAtDubai ?? "—"}</td>
                    <td className="mono">{p.ziinaRef ?? "—"}</td>
                    <td>{p.gamesPicked} of {p.gamesTotal}</td>
                    <td>
                      <span className={`pill ${p.status}`}>{p.statusLabel}</span>
                      <span className="sub">{p.status === "pending_payment" ? `expires ${p.holdExpiresDubai ?? "—"}` : "seats released"}</span>
                    </td>
                    <td>{jerseyText(p)}</td>
                  </tr>
                  {open[p.packId] && (
                    <tr className="expand-row"><td colSpan={8}><SeatsTable pack={p} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </details>
      <p className="note footnote">
        Revenue here is the pack price at purchase (informational). In the P&amp;L each pass sits inside Collected revenue as its games' per-seat share on the session dates.
      </p>
    </div>
  );
}
