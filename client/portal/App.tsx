import { useState, useCallback, FormEvent } from "react";
import { PnlPage, WeeklyPage, SessionsPage, RunnerPayPage } from "./pages";

const TOKEN_KEY = "siq_portal_token";

type PageKey = "pnl" | "weekly" | "sessions" | "pay";

const NAV: Array<{ key: PageKey; title: string }> = [
  { key: "pnl", title: "P&L" },
  { key: "weekly", title: "Weekly" },
  { key: "sessions", title: "Sessions" },
  { key: "pay", title: "Runner Pay" },
];

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

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPassword("");
    setPage("pnl");
  }, []);

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
          {NAV.map((n) => (
            <button
              key={n.key}
              className={page === n.key ? "tab active" : "tab"}
              onClick={() => setPage(n.key)}
            >
              {n.title}
            </button>
          ))}
        </nav>
        <button className="linkbtn light" onClick={logout}>
          Sign out
        </button>
      </header>
      <main className="content">
        {page === "pnl" && <PnlPage token={token} onAuthFail={logout} />}
        {page === "weekly" && <WeeklyPage token={token} onAuthFail={logout} />}
        {page === "sessions" && <SessionsPage token={token} onAuthFail={logout} />}
        {page === "pay" && <RunnerPayPage token={token} onAuthFail={logout} />}
      </main>
    </div>
  );
}
