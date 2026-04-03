const CACHE_NAME = 'shuttleiq-v4';

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ── Install: pre-cache static app shell assets ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: purge ALL old caches ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategies ────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET requests
  if (request.method !== 'GET') return;

  // Never intercept Replit workspace / infrastructure paths
  if (url.pathname.startsWith('/__replco')) return;
  if (url.pathname.startsWith('/__repl')) return;

  // Never intercept API calls or Vite HMR source files
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/src/')) return;
  if (url.pathname.startsWith('/@')) return;

  // ── 1. Vite JS/CSS chunks → network-first, cache as fallback ─────────────
  //    Chunks use content-hash filenames so they are immutable, but we
  //    always try the network first so a fresh deployment is never blocked
  //    by stale cache entries for old (now-gone) hash filenames.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── 2. Static icons / manifest → cache-first (truly immutable) ───────────
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // ── 3. HTML navigation (app shell) → network-first with cache fallback ───
  //    Always try to get fresh HTML so the index.html always references the
  //    latest chunk filenames after a deployment.
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // ── 4. Everything else → network-first with cache fallback ───────────────
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
