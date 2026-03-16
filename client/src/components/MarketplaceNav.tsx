import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Menu, User, Calendar, Trophy, BarChart3, LogOut, Home, LayoutDashboard, Bookmark } from 'lucide-react';

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
];

const authNavLinks = [
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
];

const authMenuLinks = [
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/marketplace/my-bookings', label: 'My Bookings', icon: Bookmark },
  { href: '/marketplace/my-scores', label: 'My Scores', icon: BarChart3 },
  { href: '/marketplace/profile', label: 'Profile', icon: User },
];

function getInitials(name: string | undefined) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function MarketplaceNav() {
  const { isAuthenticated, user, logout } = useMarketplaceAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return location === '/' || location === '/marketplace';
    if (href === '/marketplace/dashboard') return location === '/marketplace/dashboard';
    return location.startsWith(href) && href !== '/marketplace/dashboard';
  };

  const activeLinks = isAuthenticated ? authNavLinks : navLinks;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" data-testid="marketplace-nav">
      <div className="max-w-6xl mx-auto flex h-14 items-center gap-2 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 mr-6 shrink-0" data-testid="link-marketplace-home">
          <span className="text-xl font-bold tracking-tight">
            Shuttle<span className="text-secondary">IQ</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1">
          {activeLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button
                variant="ghost"
                size="sm"
                className={`gap-2 relative ${isActive(link.href) ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-secondary rounded-full" />
                )}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2 ml-auto">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2" data-testid="button-user-menu">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-secondary text-secondary-foreground font-semibold">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium max-w-[120px] truncate" data-testid="text-user-name">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {authMenuLinks.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <DropdownMenuItem className="gap-2 cursor-pointer" data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, '-')}`}>
                      <link.icon className="h-4 w-4" />
                      {link.label}
                    </DropdownMenuItem>
                  </Link>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 cursor-pointer" onClick={logout} data-testid="button-logout">
                  <LogOut className="h-4 w-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              {isAuthenticated && (
                <div className="flex items-center gap-3 px-3 py-2 mb-2">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-sm bg-secondary text-secondary-foreground font-semibold">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
              )}

              {activeLinks.map((link) => (
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
                  {authMenuLinks.filter(l => !activeLinks.some(a => a.href === l.href)).map((link) => (
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
                    <LogOut className="h-4 w-4" /> Log Out
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
