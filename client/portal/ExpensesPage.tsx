import { useEffect, useState, useCallback, FormEvent } from "react";
import { fmtAed } from "./pages";

// Phase 6 — expense entry moved here from the main app (full extraction). Owner-only;
// the server 403s a runner. Three sub-tabs: Expenses (CRUD + filters), Categories,
// Pending cash (the mark-cash-paid workflow).

const PAID_BY = ["Sandeep", "Arjun", "Hari", "Akhila"];

interface Category { id: string; name: string; icon: string; color: string }
interface Expense {
  id: string; categoryId: string; amountAed: number; description: string;
  vendor: string | null; paidBy: string | null; date: string; notes: string | null;
  categoryName?: string;
}
interface PendingMonth {
  month: string; totalAed: number; count: number;
  bookings: Array<{ bookingId: string; amountAed: number; spotsBooked: number; playerName: string; sessionDate: string; venueName: string }>;
}

function useAuthed(token: string, onAuthFail: () => void) {
  return useCallback(async (method: string, path: string, body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onAuthFail(); throw new Error("unauthorized"); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Request failed");
    return data;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
}

const emptyForm = { id: "", categoryId: "", amountAed: "", description: "", vendor: "", paidBy: "", date: new Date().toISOString().slice(0, 10), notes: "" };

export function ExpensesPage({ token, onAuthFail }: { token: string; onAuthFail: () => void }) {
  const call = useAuthed(token, onAuthFail);
  const [sub, setSub] = useState<"expenses" | "categories" | "pending">("expenses");
  const [cats, setCats] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pending, setPending] = useState<{ totalPendingAed: number; months: PendingMonth[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ from: "", to: "", categoryId: "", paidBy: "" });
  const [form, setForm] = useState<typeof emptyForm | null>(null); // null = closed; id='' = create
  const [catForm, setCatForm] = useState<{ id: string; name: string; icon: string; color: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCats = useCallback(() => call("GET", "/api/portal/expenses/categories").then(setCats).catch((e) => setError(e.message)), [call]);
  const loadExpenses = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.categoryId) p.set("categoryId", filters.categoryId);
    if (filters.paidBy) p.set("paidBy", filters.paidBy);
    return call("GET", `/api/portal/expenses?${p}`).then(setExpenses).catch((e) => setError(e.message));
  }, [call, filters]);
  const loadPending = useCallback(() => call("GET", "/api/portal/expenses/pending-payments").then(setPending).catch((e) => setError(e.message)), [call]);

  useEffect(() => { setError(null); loadCats(); }, [loadCats]);
  useEffect(() => { if (sub === "expenses") loadExpenses(); }, [sub, loadExpenses]);
  useEffect(() => { if (sub === "pending") loadPending(); }, [sub, loadPending]);

  async function saveExpense(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setError(null);
    try {
      const body = {
        categoryId: form.categoryId,
        amountAed: parseInt(form.amountAed, 10),
        description: form.description,
        vendor: form.vendor || null,
        paidBy: form.paidBy || null,
        date: form.date,
        notes: form.notes || null,
      };
      if (form.id) await call("PATCH", `/api/portal/expenses/${form.id}`, body);
      else await call("POST", "/api/portal/expenses", body);
      setForm(null);
      await loadExpenses();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!catForm) return;
    setBusy(true); setError(null);
    try {
      const body = { name: catForm.name, icon: catForm.icon || "circle", color: catForm.color || "#6B7280" };
      if (catForm.id) await call("PATCH", `/api/portal/expenses/categories/${catForm.id}`, body);
      else await call("POST", "/api/portal/expenses/categories", body);
      setCatForm(null);
      await loadCats();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "?";

  return (
    <div className="report">
      <nav className="tabs subtabs">
        {(["expenses", "categories", "pending"] as const).map((k) => (
          <button key={k} className={sub === k ? "tab active" : "tab"} onClick={() => { setSub(k); setError(null); }}>
            {k === "expenses" ? "Expenses" : k === "categories" ? "Categories" : "Pending cash"}
          </button>
        ))}
      </nav>
      {error && <div className="error">{error}</div>}

      {sub === "expenses" && (
        <>
          <p className="note">General business expenses (whole AED). Session costs (court/shuttle/water) are captured on sessions, not here.</p>
          <div className="upload-row">
            <label className="note toggle">From <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
            <label className="note toggle">To <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
            <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filters.paidBy} onChange={(e) => setFilters({ ...filters, paidBy: e.target.value })}>
              <option value="">Anyone</option>
              {PAID_BY.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn filebtn" onClick={() => setForm({ ...emptyForm, categoryId: cats[0]?.id ?? "" })}>Add expense</button>
          </div>

          {form && (
            <form className="pwpanel report inner" onSubmit={saveExpense}>
              <p className="formula">{form.id ? "Edit expense" : "New expense"}</p>
              <div className="field"><label>Category</label>
                <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Amount (whole AED)</label>
                <input type="number" min="1" step="1" value={form.amountAed} onChange={(e) => setForm({ ...form, amountAed: e.target.value })} required /></div>
              <div className="field"><label>Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></div>
              <div className="field"><label>Vendor (optional)</label>
                <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
              <div className="field"><label>Paid by</label>
                <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })}>
                  <option value="">—</option>
                  {PAID_BY.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="field"><label>Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
              <div className="field"><label>Notes (optional)</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="pwpanel-actions">
                <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                <button className="linkbtn" type="button" onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="tablewrap"><table>
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th className="num">AED</th><th>Paid by</th><th></th></tr></thead>
            <tbody>{expenses.map((x) => (
              <tr key={x.id}>
                <td>{x.date.slice(0, 10)}</td>
                <td>{x.categoryName ?? catName(x.categoryId)}</td>
                <td className="wrap">{x.description}{x.vendor ? ` · ${x.vendor}` : ""}</td>
                <td className="num">{fmtAed(x.amountAed)}</td>
                <td>{x.paidBy ?? "—"}</td>
                <td>
                  <button className="linkbtn" onClick={() => setForm({
                    id: x.id, categoryId: x.categoryId, amountAed: String(x.amountAed),
                    description: x.description, vendor: x.vendor ?? "", paidBy: x.paidBy ?? "",
                    date: x.date.slice(0, 10), notes: x.notes ?? "",
                  })}>Edit</button>{" "}
                  <button className="linkbtn danger" onClick={async () => {
                    if (!window.confirm("Delete this expense?")) return;
                    try { await call("DELETE", `/api/portal/expenses/${x.id}`); await loadExpenses(); }
                    catch (err) { setError((err as Error).message); }
                  }}>Delete</button>
                </td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3}>Total ({expenses.length})</td><td className="num">{fmtAed(expenses.reduce((s, x) => s + x.amountAed, 0))}</td><td colSpan={2}></td></tr></tfoot>
          </table></div>
        </>
      )}

      {sub === "categories" && (
        <>
          <div className="upload-row">
            <button className="btn filebtn" onClick={() => setCatForm({ id: "", name: "", icon: "circle", color: "#6B7280" })}>Add category</button>
          </div>
          {catForm && (
            <form className="pwpanel report inner" onSubmit={saveCategory}>
              <p className="formula">{catForm.id ? "Edit category" : "New category"}</p>
              <div className="field"><label>Name</label>
                <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required /></div>
              <div className="field"><label>Icon name</label>
                <input value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} /></div>
              <div className="field"><label>Colour</label>
                <input type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} /></div>
              <div className="pwpanel-actions">
                <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                <button className="linkbtn" type="button" onClick={() => setCatForm(null)}>Cancel</button>
              </div>
            </form>
          )}
          <div className="tablewrap"><table>
            <thead><tr><th>Category</th><th>Icon</th><th>Colour</th><th></th></tr></thead>
            <tbody>{cats.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.icon}</td>
                <td><span className="swatch" style={{ background: c.color }} /> {c.color}</td>
                <td>
                  <button className="linkbtn" onClick={() => setCatForm({ id: c.id, name: c.name, icon: c.icon, color: c.color })}>Edit</button>{" "}
                  <button className="linkbtn danger" onClick={async () => {
                    if (!window.confirm("Delete this category?")) return;
                    try { await call("DELETE", `/api/portal/expenses/categories/${c.id}`); await loadCats(); }
                    catch (err) { setError((err as Error).message); }
                  }}>Delete</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {sub === "pending" && pending && (
        <>
          <p className="note">Confirmed cash bookings not yet marked collected. Marking paid moves the money into collected revenue.</p>
          <p className="formula">Pending cash total: AED {fmtAed(pending.totalPendingAed)}</p>
          {pending.months.map((m) => (
            <div className="payweek" key={m.month}>
              <h3>{m.month}<span className="sub">{m.count} booking(s) · AED {fmtAed(m.totalAed)}</span></h3>
              <div className="tablewrap"><table>
                <thead><tr><th>Player</th><th>Session</th><th className="num">Spots</th><th className="num">AED</th><th></th></tr></thead>
                <tbody>{m.bookings.map((b) => (
                  <tr key={b.bookingId}>
                    <td>{b.playerName}</td>
                    <td>{String(b.sessionDate).slice(0, 10)} · {b.venueName}</td>
                    <td className="num">{b.spotsBooked}</td>
                    <td className="num">{fmtAed(b.amountAed)}</td>
                    <td><button className="linkbtn" onClick={async () => {
                      try {
                        await call("PATCH", `/api/portal/expenses/pending-payments/${b.bookingId}/cash-paid`, { cashPaid: true });
                        await loadPending();
                      } catch (err) { setError((err as Error).message); }
                    }}>Mark paid</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          ))}
          {pending.months.length === 0 && <p className="note">Nothing pending — all cash collected.</p>}
        </>
      )}
    </div>
  );
}
