import { useState } from "react";
import { fmtAed } from "./pages";

// Phase 4 — Ziina CSV reconciliation (fully stateless). Upload → server matches in
// memory → buckets render here. Nothing is stored anywhere — not server-side, not in
// browser storage. The advisory lives inline on this page, right beside the phantom
// bucket whose drilldown justifies it.

interface BucketRow { date: string; amountAed: number; deltaAed?: number; customer: string; detail: string }
interface Bucket { count: number; totalAed: number; rows: BucketRow[] }
interface ReconcileResult {
  meta: {
    csvRows: number; invoices: number; refunds: number;
    withdrawals: { count: number; totalAed: number };
    csvFrom: string | null; csvTo: string | null;
    offset: { stable: boolean; medianHours: number; spreadMinutes: number; pairs: number } | null;
    warnings: string[];
  };
  matchedConsistent: Bucket;
  overCapture: Bucket;
  underCollection: Bucket;
  noAppRecord: Array<{ label: string; count: number; totalAed: number; rows: BucketRow[] }>;
  phantoms: { inWindow: Bucket; afterCutoff: Bucket; preWindowCount: number } | null;
  refundLeg: {
    csvRefunds: BucketRow[];
    gapProposals: Array<{ bookingShort: string; customer: string; sessionDate: string | null; payAed: number; candidate: { date: string; amountAed: number; customer: string; deltaDays: number } | null }>;
  };
  advisory: Array<{ month: string; phantomAed: number; runnerPayDeltaAed: number }>;
  fees: { totalAed: number; byMonth: Array<{ month: string; feeAed: number }> };
}

function RowsTable({ rows }: { rows: BucketRow[] }) {
  if (!rows.length) return <p className="note">No rows.</p>;
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>Date</th><th className="num">AED</th><th>Customer</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.date}</td>
              <td className="num">{fmtAed(r.amountAed)}</td>
              <td>{r.customer}</td>
              <td className="wrap">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, tone, count, totalAed, children, note }: {
  title: string; tone?: "ok" | "warn" | "bad" | "info"; count: number; totalAed: number;
  children: React.ReactNode; note?: string;
}) {
  return (
    <details className={`runner recon ${tone ?? ""}`}>
      <summary>
        <span>{title}</span>
        <span className="runner-total">{count} · AED {fmtAed(totalAed)}</span>
      </summary>
      {note && <p className="note" style={{ padding: "0 14px" }}>{note}</p>}
      <div style={{ padding: "0 14px 12px" }}>{children}</div>
    </details>
  );
}

export function ReconcilePage({ token }: { token: string; onAuthFail: () => void }) {
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [juneOnly, setJuneOnly] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true); setError(null); setResult(null); setFileName(file.name);
    try {
      const res = await fetch("/api/portal/reconcile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/csv" },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || "Reconciliation failed."); return; }
      setResult(data as ReconcileResult);
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const filt = (rows: BucketRow[]) => (juneOnly ? rows.filter((r) => r.date.startsWith("2026-06")) : rows);
  const bucket = (b: Bucket): Bucket => {
    const rows = filt(b.rows);
    return { count: rows.length, totalAed: rows.reduce((s, r) => s + r.amountAed, 0), rows };
  };
  // Over/under headers show HOW MUCH was over-/under-charged (the per-row delta), not the
  // gross charged sum — summing amountAed here was the live 147-vs-245 display bug.
  const bucketDelta = (b: Bucket): Bucket => {
    const rows = filt(b.rows);
    return { count: rows.length, totalAed: rows.reduce((s, r) => s + (r.deltaAed ?? r.amountAed), 0), rows };
  };

  return (
    <div className="report">
      <p className="formula">Ziina CSV reconciliation</p>
      <p className="note">
        Upload the Ziina dashboard transactions export (CSV, AED). Everything is matched in memory —
        nothing is stored and no records are changed. Fixes proposed here are applied separately, by hand.
      </p>
      <div className="upload-row">
        <label className="btn filebtn">
          {busy ? "Reconciling…" : "Upload Ziina CSV"}
          <input
            type="file" accept=".csv,text/csv" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </label>
        {fileName && <span className="note" style={{ margin: 0 }}>{fileName}</span>}
        {result && (
          <label className="note toggle" style={{ margin: 0 }}>
            <input type="checkbox" checked={juneOnly} onChange={(e) => setJuneOnly(e.target.checked)} /> June only
          </label>
        )}
      </div>
      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <p className="note">
            {result.meta.csvRows} rows ({result.meta.csvFrom} → {result.meta.csvTo}) ·
            {" "}{result.meta.invoices} invoices · {result.meta.refunds} refunds ·
            {" "}{result.meta.withdrawals.count} withdrawals (AED {fmtAed(result.meta.withdrawals.totalAed)}, excluded) ·
            {" "}fees AED {fmtAed(result.fees.totalAed)} (info; P&L stays gross)
            {result.meta.offset && (
              <> · clock offset {result.meta.offset.medianHours.toFixed(2)}h ({result.meta.offset.stable ? "stable" : "UNSTABLE"}, {result.meta.offset.pairs} pairs)</>
            )}
          </p>
          {result.meta.warnings.map((w, i) => <div className="error" key={i}>{w}</div>)}

          <Section title="Matched & consistent" tone="ok" {...bucket(result.matchedConsistent)}>
            <RowsTable rows={filt(result.matchedConsistent.rows)} />
          </Section>
          <Section title="Over-capture (Ziina charged MORE than the booking)" tone="bad" {...bucketDelta(result.overCapture)}
            note="Header total = amount over-charged. Customer likely owed a refund/credit.">
            <RowsTable rows={filt(result.overCapture.rows)} />
          </Section>
          <Section title="Under-collection (Ziina charged LESS than the booking)" tone="bad" {...bucketDelta(result.underCollection)}
            note="Header total = amount never collected — the card-side cousin of unpaid cash.">
            <RowsTable rows={filt(result.underCollection.rows)} />
          </Section>

          {result.phantoms ? (
            <>
              {(() => {
                // Advisory computed from the CURRENT scope (whole export or June only),
                // rendered right beside the bucket whose drilldown justifies it.
                const scoped = bucket(result.phantoms!.inWindow);
                if (scoped.count === 0) return null;
                return (
                  <div className="advisory">
                    <div>
                      <strong>{juneOnly ? "June 2026" : `${result.meta.csvFrom} → ${result.meta.csvTo}`}</strong>:
                      {" "}recorded-but-not-captured AED {fmtAed(scoped.totalAed)} — collected is overstated by this
                      amount and runner pay by ≈ AED {fmtAed(Math.round(scoped.totalAed * 25) / 100)}.
                      <em> Unconfirmed — pending reconciliation fix.</em>
                    </div>
                    {!juneOnly && result.advisory.map((a) => (
                      <div key={a.month} className="note" style={{ margin: 0 }}>
                        {a.month}: AED {fmtAed(a.phantomAed)} (runner pay ≈ AED {fmtAed(a.runnerPayDeltaAed)})
                      </div>
                    ))}
                  </div>
                );
              })()}
              <Section title="Recorded but not captured (phantom payments)" tone="bad" {...bucket(result.phantoms.inWindow)}
                note="Our DB says 'completed', but the export has no such Ziina transaction inside its own window. This is the money-integrity bucket.">
                <RowsTable rows={filt(result.phantoms.inWindow.rows)} />
              </Section>
              <Section title="Not covered by this export (paid after the export was taken)" tone="info" {...bucket(result.phantoms.afterCutoff)}
                note={`Never flags — re-run with a fresh export to cover them. (${result.phantoms.preWindowCount} older payments predate the export window.)`}>
                <RowsTable rows={filt(result.phantoms.afterCutoff.rows)} />
              </Section>
            </>
          ) : (
            <div className="error">Time-based checks were disabled (unstable clock offset) — phantom detection unavailable for this upload.</div>
          )}

          {result.noAppRecord.map((g) => (
            <Section key={g.label} title={`In Ziina, no app record — ${g.label}`} tone="info"
              count={filt(g.rows).length} totalAed={filt(g.rows).reduce((s, r) => s + r.amountAed, 0)}
              note="Informational, not an integrity error.">
              <RowsTable rows={filt(g.rows)} />
            </Section>
          ))}

          <Section title="Refunds in the CSV" tone="info"
            count={filt(result.refundLeg.csvRefunds).length}
            totalAed={filt(result.refundLeg.csvRefunds).reduce((s, r) => s + r.amountAed, 0)}>
            <RowsTable rows={filt(result.refundLeg.csvRefunds)} />
            {result.refundLeg.gapProposals.length > 0 && (
              <>
                <p className="note"><strong>Refund-gap backfill proposals (READ-ONLY)</strong> — our rows with refundStatus
                  'completed' but no recorded amount, and the CSV refund that likely fills each. Applying any of these is a
                  separate hand-run fix; nothing is changed here.</p>
                <div className="tablewrap">
                  <table>
                    <thead><tr><th>Our gap row</th><th>Session</th><th className="num">Payment AED</th><th>Proposed CSV refund</th></tr></thead>
                    <tbody>
                      {result.refundLeg.gapProposals.map((g, i) => (
                        <tr key={i}>
                          <td>{g.bookingShort} {g.customer}</td>
                          <td>{g.sessionDate ?? "?"}</td>
                          <td className="num">{fmtAed(g.payAed)}</td>
                          <td>{g.candidate ? `${g.candidate.date} AED ${fmtAed(g.candidate.amountAed)} ${g.candidate.customer} (Δ ${g.candidate.deltaDays}d)` : "no candidate in this export"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
