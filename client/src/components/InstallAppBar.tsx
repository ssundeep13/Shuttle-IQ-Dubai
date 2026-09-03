import { useState } from 'react';
import { useInstallPrompt, IOS_INSTALL_HINT } from '@/hooks/use-install-prompt';
import { Button } from '@/components/ui/button';
import { navyBtn } from '@/pages/marketplace/LandingComponents';
import { Download, X } from 'lucide-react';

// Dismissal used to be per-tab — every new tab nagged again. Now a 7-day
// snooze persisted on the device.
const DISMISS_KEY = 'siq_install_dismissed_until';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function InstallAppBar() {
  const { canInstall, install, showIOSHint } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(isSnoozed);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch {}
    setDismissed(true);
  };

  if ((!canInstall && !showIOSHint) || dismissed) return null;

  return (
    // Renders on every width now (it was desktop-only, which hid it exactly
    // where installing matters). On phones it sits above the 64px bottom nav
    // and its safe-area inset; from md the nav is gone and it docks to the edge.
    <div
      className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-40 border-t bg-card"
      data-testid="bar-install-app"
      role="region"
      aria-label="Install ShuttleIQ"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shrink-0">
            <Download className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            {showIOSHint ? (
              <p className="text-sm font-semibold" data-testid="text-install-ios-hint">{IOS_INSTALL_HINT}</p>
            ) : (
              <>
                <p className="text-sm font-semibold truncate">Install the ShuttleIQ App</p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Fast, offline-ready, and always within reach.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!showIOSHint && (
            <button
              type="button"
              onClick={() => { void install(); }}
              {...navyBtn('sm')}
              data-testid="button-install-app"
            >
              Install
            </button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            onClick={handleDismiss}
            data-testid="button-dismiss-install"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
