import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { getMetaForUrl, injectMeta } from "./seoMeta";
import { isPortalHost } from "./portal/hostGate";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      const meta = await getMetaForUrl(url);
      template = injectMeta(template, meta);

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Main app → dist/public ; finance portal → dist/portal (Phase 2). The host wall in
  // server/index.ts has already 404'd any cross-host API before we reach here, so this
  // only needs to serve the right SPA + assets per host.
  const mainDist = path.resolve(import.meta.dirname, "public");
  const portalDist = path.resolve(import.meta.dirname, "portal");

  if (!fs.existsSync(mainDist)) {
    throw new Error(
      `Could not find the build directory: ${mainDist}, make sure to build the client first`,
    );
  }
  const portalExists = fs.existsSync(portalDist);
  if (!portalExists) {
    // Non-fatal: the main app still serves. The portal host will 503 until the
    // portal build (vite.portal.config.ts → dist/portal) has run.
    console.warn(`[Portal] build dir not found: ${portalDist} — finance.shuttleiq.ai will not serve until it is built.`);
  }

  const serveMainStatic = express.static(mainDist);
  const servePortalStatic = portalExists ? express.static(portalDist) : null;

  app.use((req, res, next) => {
    if (isPortalHost(req.hostname) && servePortalStatic) return servePortalStatic(req, res, next);
    return serveMainStatic(req, res, next);
  });

  app.use("*", async (req, res) => {
    const portal = isPortalHost(req.hostname);
    if (portal && !portalExists) {
      return res.status(503).send("Finance portal is not built yet.");
    }
    const dir = portal ? portalDist : mainDist;
    const indexPath = path.resolve(dir, "index.html");
    let html = await fs.promises.readFile(indexPath, "utf-8");

    // SEO meta injection is main-app only; the portal is a private login surface.
    if (!portal) {
      const meta = await getMetaForUrl(req.originalUrl);
      html = injectMeta(html, meta);
    }

    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  });
}
