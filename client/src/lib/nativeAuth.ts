import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { apiUrl } from './queryClient';

// The custom URL scheme the native shell is registered to receive deep-link
// returns on. Must match the server allowlist (NATIVE_DEEPLINK_SCHEME) and the
// native iOS/Android scheme registration (added at Capacitor-install time).
export const NATIVE_DEEPLINK_SCHEME = 'com.shuttleiq.app';

// Start the Google OAuth flow.
//  • Web: a full-page navigation to the server init route — byte-for-byte the
//    same behaviour as before (window.location.href to the same apiUrl).
//  • Native shell: opens the system browser via the Capacitor Browser plugin
//    (Google blocks OAuth inside embedded webviews), passing returnScheme so
//    the server redirects the tokens back through the deep link, which the
//    NativeBridge appUrlOpen listener catches.
export async function startGoogleOAuth(returnPath?: string): Promise<void> {
  const params = new URLSearchParams();
  if (returnPath) params.set('returnPath', returnPath);

  if (Capacitor.isNativePlatform()) {
    params.set('returnScheme', NATIVE_DEEPLINK_SCHEME);
    const url = apiUrl(`/api/marketplace/auth/google?${params.toString()}`);
    await Browser.open({ url });
    return;
  }

  const qs = params.toString();
  window.location.href = apiUrl(`/api/marketplace/auth/google${qs ? `?${qs}` : ''}`);
}
