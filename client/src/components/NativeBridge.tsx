import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { NATIVE_DEEPLINK_SCHEME } from '@/lib/nativeAuth';

// Central deep-link handler for the native Capacitor shell. The system browser
// (opened via the Capacitor Browser plugin for OAuth / — in part 2 — Ziina)
// returns to the app through the custom-scheme deep link
// (com.shuttleiq.app://…). The OS delivers it here via the App plugin's
// appUrlOpen event; we close the browser and resume the in-app flow.
//
// No-op on web: Capacitor.isNativePlatform() is false and appUrlOpen never
// fires there, so this renders nothing and registers no listener.
export function NativeBridge() {
  const { loginWithTokens } = useMarketplaceAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith(`${NATIVE_DEEPLINK_SCHEME}://`)) return;

      // Dismiss the system browser if it's still in front.
      try { await Browser.close(); } catch { /* already closed */ }

      let parsed: URL;
      try { parsed = new URL(url); } catch { return; }
      // scheme://auth/callback → host 'auth', pathname '/callback'.
      const route = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '');
      const params = parsed.searchParams;

      // ── Google OAuth return (part 1) ──────────────────────────────────────
      if (route === 'auth/callback') {
        const accessToken = params.get('accessToken');
        const refreshToken = params.get('refreshToken');
        const returnPath = params.get('returnPath');
        if (!accessToken || !refreshToken) {
          setLocation('/marketplace/login');
          return;
        }
        let remember = true;
        try { remember = localStorage.getItem('mp_remember') !== 'false'; } catch { /* ignore */ }
        const dest =
          returnPath && returnPath.startsWith('/marketplace/') ? returnPath : '/marketplace/dashboard';
        try {
          const mpUser = await loginWithTokens(accessToken, refreshToken, remember);
          // New Google sign-ups (no linked player) go through profile setup
          // first — mirrors GoogleAuthCallback's web routing exactly.
          if (mpUser && mpUser.linkedPlayerId === null) {
            setLocation(
              dest !== '/marketplace/complete-profile'
                ? `/marketplace/complete-profile?from=${encodeURIComponent(dest)}`
                : '/marketplace/complete-profile',
            );
          } else {
            setLocation(dest);
          }
        } catch {
          setLocation('/marketplace/login');
        }
        return;
      }

      // ── Ziina checkout return (part 2) — branches added in the next prompt:
      //   if (route === 'checkout/success') { … }
      //   if (route === 'checkout/cancel')  { … }
    });

    return () => {
      listenerPromise.then((h) => h.remove()).catch(() => {});
    };
  }, [loginWithTokens, setLocation]);

  return null;
}
