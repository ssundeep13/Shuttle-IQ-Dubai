import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startScheduler } from "./scheduler";
import { seedTags } from "./tagSeed";
import { registerZiinaWebhookRoute } from "./webhookHandler";

const app = express();

// Register the Ziina webhook endpoint BEFORE express.json() so we can read
// the raw request body for HMAC-SHA256 signature verification.
registerZiinaWebhookRoute(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    startScheduler();
  });
})();
