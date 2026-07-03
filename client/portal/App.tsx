import { useState, useCallback, useEffect, FormEvent } from "react";
import { PnlPage, WeeklyPage, SessionsPage, RunnerPayPage } from "./pages";
import { ReconcilePage } from "./ReconcilePage";
import { GrowthPage } from "./GrowthPage";
import { ExpensesPage } from "./ExpensesPage";

const TOKEN_KEY = "siq_portal_token";

type PageKey = "pnl" | "weekly" | "sessions" | "pay" | "reconcile" | "growth" | "expenses";

const NAV: Array<{ key: PageKey; title: string }> = [
  { key: "pnl", title: "P&L" },
  { key: "weekly", title: "Weekly" },
  { key: "sessions", title: "Sessions" },
  { key: "pay", title: "Runner Pay" },
  { key: "reconcile", title: "Reconciliation" },
  { key: "growth", title: "Growth" },
  { key: "expenses", title: "Expenses" },
];

// Phase 6 — every portal user changes their OWN password here (min 12 chars; all
// previous sessions are signed out server-side; a fresh token keeps this one alive).
function PasswordPanel({ token, onNewToken, onClose }: { token: string; onNewToken: (t: string) => void; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) { setMsg({ kind: "err", text: "New passwords do not match." }); return; }
    if (next.length < 12) { setMsg({ kind: "err", text: "New password must be at least 12 characters." }); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/portal/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) { setMsg({ kind: "err", text: data?.error || "Password change failed." }); return; }
      onNewToken(data.token);
      setCurrent(""); setNext(""); setConfirm("");
      setMsg({ kind: "ok", text: "Password changed. Other devices have been signed out." });
    } catch {
      setMsg({ kind: "err", text: "Password change failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report pwpanel">
      <p className="formula">Change password</p>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw-new">New password (min 12 characters)</label>
          <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {msg && <div className={msg.kind === "err" ? "error" : "note ok"}>{msg.text}</div>}
        <div className="pwpanel-actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
          <button className="linkbtn" type="button" onClick={onClose}>Close</button>
        </div>
      </form>
    </div>
  );
}

function Wordmark() {
  return (
    <div>
      <div className="wordmark">
        Shuttle<span className="iq">IQ</span>
      </div>
      <div className="wordmark-sub">Finance</div>
    </div>
  );
}

export function PortalApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState<PageKey>("pnl");
  // Role drives which tabs render (cosmetic only — the server 403s are the real wall).
  const [role, setRole] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setRole(null);
    setPassword("");
    setPage("pnl");
  }, []);

  // Reload path: token survives in localStorage but role doesn't — re-fetch it.
  useEffect(() => {
    if (!token || role !== null) return;
    let alive = true;
    fetch("/api/portal/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) { if (alive) logout(); return; }
        const data = await res.json();
        if (!alive) return;
        setRole(data.role ?? "owner");
        if (data.role === "runner") setPage("pay");
      })
      .catch(() => { if (alive) logout(); });
    return () => { alive = false; };
  }, [token, role, logout]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) {
        setAuthError(data?.error || "Invalid credentials.");
        return;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setRole(data.role ?? "owner");
      if (data.role === "runner") setPage("pay");
      setToken(data.token);
    } catch {
      setAuthError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="portal-shell">
        <Wordmark />
        <form className="card" onSubmit={handleLogin} noValidate>
          <div className="field">
            <label htmlFor="portal-email">Email</label>
            <input
              id="portal-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="portal-password">Password</label>
            <input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {authError && <div className="error">{authError}</div>}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark small">
          Shuttle<span className="iq">IQ</span>
          <span className="topbar-sub">Finance</span>
        </div>
        <nav className="tabs">
          {(role === "runner" ? NAV.filter((n) => n.key === "pay") : NAV).map((n) => (
            <button
              key={n.key}
              className={page === n.key ? "tab active" : "tab"}
              onClick={() => setPage(n.key)}
            >
              {n.title}
            </button>
          ))}
        </nav>
        <button className="linkbtn light" onClick={() => setShowPassword((v) => !v)}>
          Password
        </button>
        <button className="linkbtn light" onClick={logout}>
          Sign out
        </button>
      </header>
      <main className="content">
        {showPassword && (
          <PasswordPanel
            token={token}
            onNewToken={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }}
            onClose={() => setShowPassword(false)}
          />
        )}
        {page === "pnl" && <PnlPage token={token} onAuthFail={logout} />}
        {page === "weekly" && <WeeklyPage token={token} onAuthFail={logout} />}
        {page === "sessions" && <SessionsPage token={token} onAuthFail={logout} />}
        {page === "pay" && <RunnerPayPage token={token} onAuthFail={logout} />}
        {page === "reconcile" && <ReconcilePage token={token} onAuthFail={logout} />}
        {page === "growth" && <GrowthPage token={token} onAuthFail={logout} />}
        {page === "expenses" && <ExpensesPage token={token} onAuthFail={logout} />}
      </main>
    </div>
  );
}
