/**
 * PWA install prompt — Gate 1.
 *
 * Before: the hook kept the deferred `beforeinstallprompt` event in
 * per-component state, so only a consumer already mounted when Chrome fired
 * it (once per page load) could ever install. The bar was desktop-only and
 * iPhone users got nothing at all (Safari never fires the event).
 *
 * Now: the event is captured ONCE at module level and shared by every
 * consumer whenever it mounts; install()/appinstalled clear it for all;
 * iOS Safari gets a Share → Add to Home Screen hint; the bar renders on
 * mobile with a 7-day localStorage dismiss.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const HOOK = '../client/src/hooks/use-install-prompt';
const BAR = '../client/src/components/InstallAppBar';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

function makePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

let standaloneMatches = false;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  standaloneMatches = false;
  // jsdom has no matchMedia; the hook reads '(display-mode: standalone)'.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('standalone') ? standaloneMatches : false,
    media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  })) as unknown as typeof window.matchMedia;
  setUA(ANDROID_CHROME_UA);
});

afterEach(() => {
  delete (window.navigator as { standalone?: boolean }).standalone;
});

// A consumer that surfaces the hook's state as attributes — real hook, no mocks.
async function loadProbe() {
  const { useInstallPrompt } = await import(HOOK);
  return function Probe({ id }: { id: string }) {
    const s = useInstallPrompt();
    return (
      <div
        data-testid={id}
        data-can={String(s.canInstall)}
        data-ios={String(s.showIOSHint)}
        data-installed={String(s.isInstalled)}
        onClick={() => { void s.install(); }}
      />
    );
  };
}

describe('useInstallPrompt — module-level capture', () => {
  it('a consumer mounted AFTER beforeinstallprompt fired still sees the prompt', async () => {
    const Probe = await loadProbe();
    act(() => { window.dispatchEvent(makePromptEvent()); });
    render(<Probe id="late" />);
    expect(screen.getByTestId('late').dataset.can).toBe('true');
  });

  it('install() from one consumer clears the prompt for every consumer', async () => {
    const Probe = await loadProbe();
    const ev = makePromptEvent('dismissed');
    act(() => { window.dispatchEvent(ev); });
    render(<><Probe id="a" /><Probe id="b" /></>);
    expect(screen.getByTestId('a').dataset.can).toBe('true');
    expect(screen.getByTestId('b').dataset.can).toBe('true');

    await act(async () => { fireEvent.click(screen.getByTestId('a')); await Promise.resolve(); await Promise.resolve(); });

    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('a').dataset.can).toBe('false');
    expect(screen.getByTestId('b').dataset.can).toBe('false');
  });

  it('appinstalled marks every consumer installed and drops the prompt', async () => {
    const Probe = await loadProbe();
    act(() => { window.dispatchEvent(makePromptEvent()); });
    render(<><Probe id="a" /><Probe id="b" /></>);
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    for (const id of ['a', 'b']) {
      expect(screen.getByTestId(id).dataset.can).toBe('false');
      expect(screen.getByTestId(id).dataset.installed).toBe('true');
    }
  });

  it('already-standalone: not installable, no hint, isInstalled', async () => {
    standaloneMatches = true;
    const Probe = await loadProbe();
    act(() => { window.dispatchEvent(makePromptEvent()); });
    render(<Probe id="p" />);
    expect(screen.getByTestId('p').dataset.installed).toBe('true');
    expect(screen.getByTestId('p').dataset.can).toBe('false');
    expect(screen.getByTestId('p').dataset.ios).toBe('false');
  });
});

describe('useInstallPrompt — iOS Safari', () => {
  it('iPhone Safari, not installed → showIOSHint (no prompt event ever fires there)', async () => {
    setUA(IPHONE_SAFARI_UA);
    const Probe = await loadProbe();
    render(<Probe id="p" />);
    expect(screen.getByTestId('p').dataset.ios).toBe('true');
    expect(screen.getByTestId('p').dataset.can).toBe('false');
  });

  it('iPhone running from the home screen (navigator.standalone) → no hint', async () => {
    setUA(IPHONE_SAFARI_UA);
    (window.navigator as { standalone?: boolean }).standalone = true;
    const Probe = await loadProbe();
    render(<Probe id="p" />);
    expect(screen.getByTestId('p').dataset.ios).toBe('false');
    expect(screen.getByTestId('p').dataset.installed).toBe('true');
  });

  it('Android Chrome → no iOS hint', async () => {
    const Probe = await loadProbe();
    render(<Probe id="p" />);
    expect(screen.getByTestId('p').dataset.ios).toBe('false');
  });
});

describe('InstallAppBar — mobile, iOS hint, 7-day dismiss', () => {
  it('dismiss writes siq_install_dismissed_until ≈ now + 7 days to localStorage and hides the bar', async () => {
    const { InstallAppBar } = await import(BAR);
    act(() => { window.dispatchEvent(makePromptEvent()); });
    render(<InstallAppBar />);
    expect(screen.getByTestId('bar-install-app')).toBeTruthy();

    const before = Date.now();
    fireEvent.click(screen.getByTestId('button-dismiss-install'));
    const until = Number(localStorage.getItem('siq_install_dismissed_until'));
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(until).toBeGreaterThanOrEqual(before + week - 5000);
    expect(until).toBeLessThanOrEqual(Date.now() + week + 5000);
    expect(screen.queryByTestId('bar-install-app')).toBeNull();
    expect(sessionStorage.getItem('siq_install_dismissed')).toBeNull();
  });

  it('stays hidden while the dismissal is in the future, returns once it has expired', async () => {
    const { InstallAppBar } = await import(BAR);
    act(() => { window.dispatchEvent(makePromptEvent()); });

    localStorage.setItem('siq_install_dismissed_until', String(Date.now() + 60_000));
    const r1 = render(<InstallAppBar />);
    expect(screen.queryByTestId('bar-install-app')).toBeNull();
    r1.unmount();

    localStorage.setItem('siq_install_dismissed_until', String(Date.now() - 60_000));
    render(<InstallAppBar />);
    expect(screen.getByTestId('bar-install-app')).toBeTruthy();
  });

  it('on iOS Safari shows the Share → Add to Home Screen hint instead of an Install button, keeps dismiss', async () => {
    setUA(IPHONE_SAFARI_UA);
    const { InstallAppBar } = await import(BAR);
    render(<InstallAppBar />);
    const bar = screen.getByTestId('bar-install-app');
    expect(bar.textContent).toContain('Install ShuttleIQ: tap Share, then Add to Home Screen.');
    expect(screen.queryByTestId('button-install-app')).toBeNull();
    expect(screen.getByTestId('button-dismiss-install')).toBeTruthy();
  });

  it('renders nothing when neither installable nor iOS', async () => {
    const { InstallAppBar } = await import(BAR);
    render(<InstallAppBar />);
    expect(screen.queryByTestId('bar-install-app')).toBeNull();
  });

  it('source: no desktop-only gate, no sessionStorage, no drifted hex, no emoji', () => {
    const src = read('client/src/components/InstallAppBar.tsx');
    expect(src).not.toMatch(/hidden md:block/);
    expect(src).not.toMatch(/sessionStorage/);
    expect(src).not.toMatch(/003E8C|F5EFE0/i);
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(src).toMatch(/navyBtn\(/);
  });
});

describe('Dashboard + Profile install surfaces', () => {
  it('Dashboard "Get the App" card carries the same iOS hint logic, no dismiss', () => {
    const src = read('client/src/pages/marketplace/Dashboard.tsx');
    const i = src.indexOf('card-install-app');
    expect(i).toBeGreaterThan(0);
    const block = src.slice(i - 400, i + 1200);
    expect(block).toMatch(/showIOSHint/);
    expect(block).toMatch(/IOS_INSTALL_HINT/); // one exported copy string, not a third literal
    expect(block).not.toMatch(/dismiss/i);
    expect(src).toMatch(/\{\(canInstall \|\| showIOSHint\) && \(/);
  });

  it('the hint copy is defined once, in the hook', () => {
    const hook = read('client/src/hooks/use-install-prompt.ts');
    expect(hook).toContain("export const IOS_INSTALL_HINT = 'Install ShuttleIQ: tap Share, then Add to Home Screen.'");
  });

  it('Profile has an always-visible install row, hidden only when already installed', () => {
    const src = read('client/src/pages/marketplace/Profile.tsx');
    const i = src.indexOf('card-install-app-profile');
    expect(i).toBeGreaterThan(0);
    const block = src.slice(i - 300, i + 1400);
    expect(block).toContain('Install ShuttleIQ on this device');
    expect(block).toMatch(/showIOSHint/);
    expect(block).toMatch(/IOS_INSTALL_HINT/);
    expect(src.slice(i - 600, i)).toMatch(/!isInstalled && \(/);
    expect(src.slice(i - 600, i)).not.toMatch(/canInstall/);
    expect(src).toMatch(/import \{ useInstallPrompt, IOS_INSTALL_HINT \} from '@\/hooks\/use-install-prompt'/);
  });
});
