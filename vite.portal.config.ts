import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Second, standalone SPA build for the finance portal (Phase 2). Root is
// client/portal; output is dist/portal, which the host-aware serveStatic() serves
// only on finance.shuttleiq.ai. Kept intentionally minimal — no Tailwind/shadcn,
// no main-app code — so the portal bundle stays tiny and independent.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client", "portal"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/portal"),
    emptyOutDir: true,
  },
});
