import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Group stable vendor libraries into separately cached chunks.
        // When app code changes, the vendor chunk stays cached in the browser.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // React runtime — changes rarely, maximises cache hit rate
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          // TanStack Query
          if (id.includes("@tanstack")) {
            return "vendor-query";
          }
          // Radix UI headless primitives
          if (id.includes("@radix-ui")) {
            return "vendor-radix";
          }
          // Lucide icon set
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
          // date-fns and all other third-party libs in one shared chunk
          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
