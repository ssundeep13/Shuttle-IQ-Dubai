import { Link, useLocation } from 'wouter';
import { Home, Calendar, Bookmark, LayoutDashboard, Trophy, LogIn, BarChart2, FileText } from 'lucide-react';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

// #68: Rankings was reachable from three Dashboard links but lived on no auth
// tab — landing there lit nothing and offered no way back ("never trap").
// Five tabs still clear 44px each down to a 320px viewport (64px per tab).
const authTabs = [
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  // "Bookings" not "My Bookings": the two-word label wrapped at 390px (5 tabs
  // share the width) and made this tab taller than its siblings. Label only —
  // the route is unchanged.
  { href: '/marketplace/my-bookings', label: 'Bookings', icon: Bookmark },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
  { href: '/marketplace/my-scores', label: 'Stats', icon: BarChart2 },
];

const guestTabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
  { href: '/marketplace/blog', label: 'Blog', icon: FileText },
  { href: '/marketplace/login', label: 'Log In', icon: LogIn },
];

export function MobileBottomNav() {
  const { isAuthenticated } = useMarketplaceAuth();
  const [location] = useLocation();

  const tabs = isAuthenticated ? authTabs : guestTabs;

  const isActive = (href: string) => {
    if (href === '/') return location === '/' || location === '/marketplace';
    if (href === '/marketplace/dashboard') {
      // Profile and Referrals have no tab of their own (the bar is full at
      // five); the Dashboard tab carries them so the "where am I" question
      // always has an answer (#68).
      return location === '/marketplace/dashboard' || location.startsWith('/marketplace/profile') || location.startsWith('/marketplace/referrals');
    }
    if (href === '/marketplace/book') {
      return location === '/marketplace/book' || location.startsWith('/marketplace/sessions/') || location.startsWith('/marketplace/checkout/');
    }
    if (href === '/marketplace/my-scores') {
      return location === '/marketplace/my-scores' || location === '/marketplace/game-history';
    }
    return location.startsWith(href);
  };

  return (
    <nav
      // pb-[env(safe-area-inset-bottom)]: the body's safe-area padding does not
      // reach a fixed child. Without this, on home-indicator iPhones the bottom
      // ~34px of the 64px bar sits under the gesture zone (index.html sets
      // viewport-fit=cover). The bar extends INTO the inset; the 64px of tabs
      // stay above it.
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]"
      style={{ backgroundColor: '#002C84' }}
      data-testid="mobile-bottom-nav"
    >
      <div className="flex h-16 items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="siq-press flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors"
              style={{
                borderTop: active ? '2px solid #00766C' : '2px solid transparent',
              }}
              data-testid={`tab-${tab.label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <tab.icon
                className="h-5 w-5 transition-colors"
                style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.45)' }}
              />
              <span
                // whitespace-nowrap: a label that outgrows its tab must
                // overflow visibly in dev, not wrap into a second line.
                className="whitespace-nowrap text-[11px] font-semibold leading-none transition-colors tracking-[0.04em] uppercase"
                style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.45)' }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
