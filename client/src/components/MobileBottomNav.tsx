import { Link, useLocation } from 'wouter';
import { Home, Calendar, Bookmark, LayoutDashboard, Trophy, LogIn } from 'lucide-react';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const authTabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/my-bookings', label: 'My Bookings', icon: Bookmark },
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
    return location.startsWith(href) && href !== '/marketplace/dashboard';
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
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
              data-testid={`tab-${tab.label.toLowerCase().replace(/\s/g, '-')}`}
            >
              <tab.icon
                className={`h-5 w-5 transition-colors ${active ? 'text-secondary' : 'text-muted-foreground'}`}
              />
              <span
                className={`text-[10px] font-medium leading-none transition-colors ${active ? 'text-secondary' : 'text-muted-foreground'}`}
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
