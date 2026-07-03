import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startScheduler } from "./scheduler";
import { seedTags } from "./tagSeed";
import { registerZiinaWebhookRoute } from "./webhookHandler";
import { shouldBlockCrossHost } from "./portal/hostGate";

const app = express();
app.set('trust proxy', 1);

// Canonical-domain redirect — MUST be the first middleware so it short-circuits
// before any other processing. Permanently (301) sends the legacy domains to the
// equivalent path on https://shuttleiq.ai, preserving the full path + query
// string (req.originalUrl). Only the two legacy hostnames match; shuttleiq.ai
// and the *.up.railway.app service domain fall through untouched (no redirect
// loop). trust proxy is set above, so req.hostname reflects the forwarded Host.
// Inert until shuttleiq.org / shuttleiqdubai.com actually point at Railway.
const LEGACY_REDIRECT_HOSTS = new Set(["shuttleiq.org", "shuttleiqdubai.com"]);
app.use((req, res, next) => {
  const host = req.hostname?.toLowerCase();
  if (host && LEGACY_REDIRECT_HOSTS.has(host)) {
    return res.redirect(301, `https://shuttleiq.ai${req.originalUrl}`);
  }
  next();
});

// Host wall (Phase 2). Registered before every route/static handler so a request
// that crosses the wall (main-app API on the portal host, or a portal API on a main
// host, or /uploads on the portal host) is 404'd here and never reaches the app.
// /api/health is exempt on every host. See server/portal/hostGate.ts.
app.use((req, res, next) => {
  if (shouldBlockCrossHost(req.hostname, req.path)) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), "uploads"), {
    maxAge: "30d",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);

// Register the Ziina webhook endpoint BEFORE express.json() so we can read
// the raw request body for HMAC-SHA256 signature verification.
registerZiinaWebhookRoute(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// CORS — required only for the native Capacitor shell, which loads the web
// bundle from a different origin (capacitor://localhost on iOS,
// https://localhost on Android — Capacitor 3+ defaults androidScheme to https)
// than the Railway API. The web app is same-origin, and browsers do not apply
// CORS to same-origin requests, so these headers are inert for it — web
// behaviour is unchanged.
//
// We REFLECT only explicitly-allowed origins (never '*'), and keep
// Access-Control-Allow-Credentials: true so the existing cookie/Bearer auth
// keeps working from the shell. Allowed origins:
//   • capacitor://localhost — iOS shell
//   • https://localhost — Android shell (default https scheme)
//   • http://localhost — Android shell when androidScheme is set to http
//   • the deployed web origin(s) from REPLIT_DOMAINS (existing convention)
//   • any extra origins in CORS_ALLOWED_ORIGINS (comma-separated) — e.g. the
//     Railway domain, set per-environment without a code change.
const CORS_ALLOWED_ORIGINS = new Set<string>([
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  ...(process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(',').map((d) => `https://${d.trim()}`)
    : []),
  ...(process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : []),
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return res.sendStatus(204);
    }
  }
  next();
});

// Rate limiter: max 10 login attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/marketplace/auth/login', authLimiter);
app.use('/api/marketplace/auth/signup', authLimiter);
app.use('/api/portal/auth/login', authLimiter);
app.use('/api/portal/auth/change-password', authLimiter);

// Lightweight health-check — responds instantly without touching the DB.
// External uptime monitors (e.g. UptimeRobot) can ping this every 5 minutes
// to keep the server warm and prevent cold-start delays for real users.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Warn at startup if ZIINA_WEBHOOK_SECRET is missing while Ziina is configured.
if (process.env.ZIINA_API_TOKEN && !process.env.ZIINA_WEBHOOK_SECRET) {
  console.warn(
    "[Config] ZIINA_WEBHOOK_SECRET is not set. Ziina webhook signature verification will be skipped. " +
    "Set ZIINA_WEBHOOK_SECRET in Replit Secrets, then call POST /api/admin/ziina/register-webhook to activate."
  );
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  await seedTags();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  // Windows does not support reusePort / 0.0.0.0 binding via this options form
  // (throws ENOTSUP). Use a platform-aware listen config so local dev works.
  const isWindows = process.platform === "win32";
  const listenOptions = isWindows
    ? { port, host: "127.0.0.1" }
    : { port, host: "0.0.0.0", reusePort: true };
  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
    startScheduler();
  });
})();
