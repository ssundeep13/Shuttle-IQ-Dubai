import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, X, User, Calendar, Trophy, BarChart3, LogOut, Home } from 'lucide-react';

const navLinks = [
  { href: '/marketplace', label: 'Home', icon: Home },
  { href: '/marketplace/book', label: 'Book Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
];

const authLinks = [
  { href: '/marketplace/my-bookings', label: 'My Bookings', icon: Calendar },
  { href: '/marketplace/my-scores', label: 'My Scores', icon: BarChart3 },
  { href: '/marketplace/profile', label: 'Profile', icon: User },
];

export function MarketplaceNav() {
  const { isAuthenticated, user, logout } = useMarketplaceAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/marketplace') return location === '/marketplace';
    return location.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" data-testid="marketplace-nav">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <Link href="/marketplace" className="flex items-center gap-2 mr-4" data-testid="link-marketplace-home">
          <span className="text-lg font-bold">Shuttle<span className="text-[#00766C]">IQ</span></span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant={isActive(link.href) ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-2"
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Button>
            </Link>
          ))}
          {isAuthenticated && authLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant={isActive(link.href) ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-2"
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2 ml-auto">
          {isAuthenticated ? (
            <>
              <span className="text-sm text-muted-foreground" data-testid="text-user-name">{user?.name}</span>
              <Button variant="ghost" size="sm" onClick={logout} data-testid="button-logout">
                <LogOut className="h-4 w-4 mr-1" /> Logout
              </Button>
            </>
          ) : (
            <>
              <Link href="/marketplace/login">
                <Button variant="ghost" size="sm" data-testid="button-login">Log In</Button>
              </Link>
              <Link href="/marketplace/signup">
                <Button size="sm" data-testid="button-signup">Sign Up</Button>
              </Link>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden ml-auto">
            <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <div className="flex flex-col gap-1 mt-6">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
                  <Button
                    variant={isActive(link.href) ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    data-testid={`link-mobile-${link.label.toLowerCase().replace(/\s/g, '-')}`}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Button>
                </Link>
              ))}
              {isAuthenticated && (
                <>
                  <div className="h-px bg-border my-2" />
                  {authLinks.map((link) => (
                    <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
                      <Button
                        variant={isActive(link.href) ? 'secondary' : 'ghost'}
                        className="w-full justify-start gap-2"
                        data-testid={`link-mobile-${link.label.toLowerCase().replace(/\s/g, '-')}`}
                      >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                      </Button>
                    </Link>
                  ))}
                  <div className="h-px bg-border my-2" />
                  <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => { logout(); setOpen(false); }} data-testid="button-mobile-logout">
                    <LogOut className="h-4 w-4" /> Logout
                  </Button>
                </>
              )}
              {!isAuthenticated && (
                <>
                  <div className="h-px bg-border my-2" />
                  <Link href="/marketplace/login" onClick={() => setOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start" data-testid="button-mobile-login">Log In</Button>
                  </Link>
                  <Link href="/marketplace/signup" onClick={() => setOpen(false)}>
                    <Button className="w-full justify-start" data-testid="button-mobile-signup">Sign Up</Button>
                  </Link>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
