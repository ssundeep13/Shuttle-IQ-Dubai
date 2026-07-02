// Host wall between the main app and the finance portal (Phase 2). Both run in ONE
// Express process; this decides, per (host, path), whether a request crosses the wall
// and must be 404'd. Pure + unit-testable.
//
// - /api/health is exempt everywhere (Railway healthcheck must always pass).
// - On the PORTAL host (finance.shuttleiq.ai): only /api/portal/* API is allowed; all
//   other /api/* (the main app) and /uploads are blocked; SPA/asset paths pass (served
//   from dist/portal by the host-aware static handler).
// - On main hosts (shuttleiq.ai, the *.up.railway.app service domain): /api/portal/* is
//   blocked; everything else is the app as it is today.
export const PORTAL_HOST = (process.env.PORTAL_HOST || 'finance.shuttleiq.ai').toLowerCase();

export function isPortalHost(host: string | undefined): boolean {
  return (host || '').toLowerCase() === PORTAL_HOST;
}

export function shouldBlockCrossHost(host: string | undefined, path: string): boolean {
  if (path === '/api/health') return false; // exempt on every host
  const portal = isPortalHost(host);
  const isPortalApi = path.startsWith('/api/portal/');
  if (portal) {
    if (path.startsWith('/api/')) return !isPortalApi; // portal host: only portal APIs
    if (path.startsWith('/uploads')) return true;       // main-app content, not for the portal
    return false;                                        // SPA + assets → dist/portal
  }
  return isPortalApi; // main host: block portal APIs only
}
