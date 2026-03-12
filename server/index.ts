import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { WebhookHandlers } from "./webhookHandlers";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

const app = express();

const webhookHandler = async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature' });
  }
  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!Buffer.isBuffer(req.body)) {
      console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer.');
      return res.status(500).json({ error: 'Webhook processing error' });
    }
    await WebhookHandlers.processWebhook(req.body as Buffer, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook processing error' });
  }
};

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.post('/api/marketplace/stripe/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      console.log('Initializing Stripe schema...');
      await runMigrations({ databaseUrl, schema: 'stripe' });
      console.log('Stripe schema ready');

      const stripeSync = await getStripeSync();
      const replitDomains = process.env.REPLIT_DOMAINS;
      if (replitDomains) {
        const webhookBaseUrl = `https://${replitDomains.split(',')[0]}`;
        console.log('Setting up managed webhook...');
        const webhookResult = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        console.log('Webhook configured:', JSON.stringify(webhookResult?.webhook?.url || 'setup complete'));
      }

      console.log('Syncing Stripe data...');
      stripeSync.syncBackfill()
        .then(() => console.log('Stripe data synced'))
        .catch((err: any) => console.error('Error syncing Stripe data:', err));
    }
  } catch (error) {
    console.error('Failed to initialize Stripe (non-fatal):', error);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
