import { Link, useLocation } from 'wouter';
import { Home, Calendar, Bookmark, LayoutDashboard, Trophy, LogIn, BarChart2 } from 'lucide-react';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const authTabs = [
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/my-bookings', label: 'My Bookings', icon: Bookmark },
  { href: '/marketplace/my-scores', label: 'Stats', icon: BarChart2 },
];

const guestTabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
  { href: '/marketplace/login', label: 'Log In', icon: LogIn },
];

export function MobileBottomNav() {
  const { isAuthenticated } = useMarketplaceAuth();
  const [location] = useLocation();

  const tabs = isAuthenticated ? authTabs : guestTabs;

  const isActive = (href: string) => {
    if (href === '/') return location === '/' || location === '/marketplace';
    if (href === '/marketplace/dashboard') return location === '/marketplace/dashboard';
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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40"
      style={{ backgroundColor: '#003E8C' }}
      data-testid="mobile-bottom-nav"
    >
      <div className="flex h-16 items-stretch">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors"
              style={{
                borderTop: active ? '2px solid #006B5F' : '2px solid transparent',
              }}
              data-testid={`tab-${tab.label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <tab.icon
                className="h-5 w-5 transition-colors"
                style={{ color: active ? '#ffffff' : 'rgba(255,255,255,0.45)' }}
              />
              <span
                className="text-[10px] font-semibold leading-none transition-colors tracking-[0.04em] uppercase"
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
