import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { User, Calendar, Trophy, BarChart3, LogOut, Home, LayoutDashboard, Bookmark, Bell, CheckCheck, History, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MarketplaceNotification } from '@shared/schema';

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
  { href: '/marketplace/blog', label: 'Blog', icon: FileText },
];

const authNavLinks = [
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/marketplace/book', label: 'Sessions', icon: Calendar },
  { href: '/marketplace/rankings', label: 'Rankings', icon: Trophy },
  { href: '/marketplace/blog', label: 'Blog', icon: FileText },
];

const authMenuLinks = [
  { href: '/marketplace/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/marketplace/my-bookings', label: 'My Bookings', icon: Bookmark },
  { href: '/marketplace/my-scores', label: 'My Scores', icon: BarChart3 },
  { href: '/marketplace/game-history', label: 'Game History', icon: History },
  { href: '/marketplace/profile', label: 'Profile', icon: User },
];

function getInitials(name: string | undefined) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface NotificationsResponse {
  notifications: MarketplaceNotification[];
  unreadCount: number;
}

function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ['/api/marketplace/notifications'],
    refetchInterval: 30000,
  });

  const readAllMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/marketplace/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/notifications'] });
    },
  });

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && data && data.unreadCount > 0) {
      readAllMutation.mutate();
    }
  };

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white/80 hover:text-white hover:bg-white/10"
          data-testid="button-notifications"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="panel-notifications">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs gap-1 text-muted-foreground"
              onClick={() => readAllMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground/70">We'll notify you about your bookings and waitlist updates.</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 ${!n.read ? 'bg-secondary/5' : ''}`}
                  data-testid={`notification-${n.id}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-secondary shrink-0" />
                    )}
                    <div className={`min-w-0 flex-1 ${n.read ? 'pl-4' : ''}`}>
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MarketplaceNav() {
  const { isAuthenticated, user, logout } = useMarketplaceAuth();
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === '/') return location === '/' || location === '/marketplace';
    if (href === '/marketplace/dashboard') return location === '/marketplace/dashboard';
    return location.startsWith(href) && href !== '/marketplace/dashboard';
  };

  const activeLinks = isAuthenticated ? authNavLinks : navLinks;

  return (
    <header
      className="sticky top-0 z-50"
      style={{ backgroundColor: '#003E8C' }}
      data-testid="marketplace-nav"
    >
      <div className="max-w-6xl mx-auto flex h-14 items-center gap-2 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 mr-6 shrink-0" data-testid="link-marketplace-home">
          <span className="text-xl font-bold tracking-tight text-white">
            Shuttle<span style={{ color: '#006B5F' }}>IQ</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center flex-1">
          {activeLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 rounded-none"
                  style={{
                    height: '56px',
                    color: active ? '#ffffff' : 'rgba(255,255,255,0.45)',
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    borderRadius: 0,
                    borderBottom: active ? '2px solid #006B5F' : '2px solid transparent',
                  }}
                  data-testid={`link-nav-${link.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <link.icon className="h-4 w-4 shrink-0" />
                  {link.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2 ml-auto">
          {isAuthenticated ? (
            <>
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-white/90 hover:text-white hover:bg-white/10"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-7 w-7">
                      {user?.photoUrl ? (
                        <AvatarImage src={user.photoUrl} alt={user.name} data-testid="img-nav-avatar" />
                      ) : null}
                      <AvatarFallback className="text-xs font-semibold" style={{ backgroundColor: '#006B5F', color: '#ffffff' }}>
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
            </>
          ) : (
            <>
              <Link href="/marketplace/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                  data-testid="button-login"
                >
                  Log In
                </Button>
              </Link>
              <Link href="/marketplace/signup">
                <Button
                  size="sm"
                  className="font-semibold"
                  style={{ backgroundColor: '#006B5F', color: '#ffffff', borderColor: '#006B5F' }}
                  data-testid="button-signup"
                >
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>

        <div className="md:hidden ml-auto flex items-center gap-2">
          {isAuthenticated && <NotificationBell />}
        </div>
      </div>
    </header>
  );
}
