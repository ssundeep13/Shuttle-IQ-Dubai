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

// Navigate to a Ziina hosted-payment redirect URL.
//  • Web: full-page navigation, exactly as today.
//  • Native: open the system browser (Capacitor Browser) so the app survives
//    underneath and the deep-link return (com.shuttleiq.app://checkout/…) can
//    bring us back via the NativeBridge appUrlOpen handler.
export async function openCheckoutRedirect(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}

// Native return marker to merge into a booking/payment request body so the
// server emits deep-link return URLs. Empty object on web (spreads to nothing →
// request body byte-for-byte unchanged).
export function nativeReturnFields(): Record<string, string> {
  return Capacitor.isNativePlatform() ? { returnScheme: NATIVE_DEEPLINK_SCHEME } : {};
}

// Same marker for apiRequest() calls that currently send NO body — returns
// undefined on web so the request stays body-less exactly as today.
export function nativeReturnBody(): Record<string, string> | undefined {
  return Capacitor.isNativePlatform() ? { returnScheme: NATIVE_DEEPLINK_SCHEME } : undefined;
}
