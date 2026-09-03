import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** iOS Safari never fires beforeinstallprompt; this is the manual route. */
export const IOS_INSTALL_HINT = 'Install ShuttleIQ: tap Share, then Add to Home Screen.';

// ── Module-level store ─────────────────────────────────────────────────────
// Chrome fires `beforeinstallprompt` ONCE per page load, typically before any
// route component has mounted. Holding the event in component state meant
// only a consumer that happened to be mounted at that instant could ever
// install; the Dashboard card (mounted later via navigation) saw nothing.
// Capturing at module level lets every consumer share one deferred prompt,
// whenever it mounts, and one install() / appinstalled clears it for all.
interface InstallState {
  prompt: BeforeInstallPromptEvent | null;
  installed: boolean;
}
let state: InstallState = { prompt: null, installed: false };
const listeners = new Set<() => void>();

function setState(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getSnapshot() {
  return state;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    setState({ prompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    setState({ prompt: null, installed: true });
  });
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const viaMedia =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  // iOS home-screen apps report `navigator.standalone` instead.
  const viaIOS = (window.navigator as { standalone?: boolean }).standalone === true;
  return viaMedia || viaIOS;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ presents a desktop-Safari UA; the touch-point count tells it apart.
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Shows the browser's install dialog. Safe to call from any consumer. */
export async function installApp(): Promise<void> {
  const ev = state.prompt;
  if (!ev) return;
  // The browser allows prompt() exactly once per event — clear it for every
  // consumer BEFORE showing, so a second tap elsewhere can't re-fire it.
  setState({ prompt: null });
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome === 'accepted') setState({ installed: true });
}

export function useInstallPrompt() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isInstalled = s.installed || isStandalone();
  const isIOS = isIOSDevice();
  return {
    canInstall: !!s.prompt && !isInstalled,
    install: installApp,
    isInstalled,
    isIOS,
    // iOS Safari, not yet on the home screen: no event will ever arrive, so
    // the surfaces show the manual Share → Add to Home Screen route instead.
    showIOSHint: isIOS && !isInstalled && !s.prompt,
  };
}
