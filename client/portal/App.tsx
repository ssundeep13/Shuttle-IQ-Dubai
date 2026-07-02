import { useEffect, useState, useCallback, FormEvent } from "react";

const TOKEN_KEY = "siq_portal_token";

interface Summary {
  collectedAed: number;
  month: string; // YYYY-MM
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

function formatMonth(ym: string): string {
  // "2026-07" → "July 2026"
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${y}`;
}

export function PortalApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSummary(null);
    setPassword("");
  }, []);

  const loadSummary = useCallback(
    async (jwt: string) => {
      setLoadingSummary(true);
      setSummaryError(null);
      try {
        const res = await fetch("/api/portal/finance/summary", {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (res.status === 401) {
          logout();
          return;
        }
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as Summary;
        setSummary(data);
      } catch {
        setSummaryError("Couldn't load the figure. Try again.");
      } finally {
        setLoadingSummary(false);
      }
    },
    [logout],
  );

  useEffect(() => {
    if (token) loadSummary(token);
  }, [token, loadSummary]);

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

  return (
    <div className="portal-shell">
      <Wordmark />

      {!token ? (
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
      ) : (
        <div className="card">
          <p className="dash-label">Collected revenue this month</p>
          {loadingSummary ? (
            <div className="skeleton" />
          ) : summaryError ? (
            <>
              <div className="error">{summaryError}</div>
              <button className="btn" onClick={() => token && loadSummary(token)}>
                Retry
              </button>
            </>
          ) : summary ? (
            <>
              <div className="dash-figure">
                <span className="cur">AED</span>
                {summary.collectedAed.toLocaleString("en-US")}
              </div>
              <p className="dash-month">{formatMonth(summary.month)}</p>
            </>
          ) : null}

          <div className="dash-foot">
            <span className="dash-user">Signed in</span>
            <button className="linkbtn" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
