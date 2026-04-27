import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Redirect, useLocation } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

// Routes that an authenticated-but-unlinked user (e.g. fresh Google sign-up
// who hasn't completed the assessment yet) is still allowed to reach. The
// complete-profile page itself must be reachable, otherwise we'd loop.
const PROFILE_INCOMPLETE_ALLOWLIST: readonly string[] = [
  '/marketplace/complete-profile',
];

export function MarketplaceProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useMarketplaceAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginUrl = location && location !== '/marketplace/login'
      ? `/marketplace/login?from=${encodeURIComponent(location)}`
      : '/marketplace/login';
    return <Redirect to={loginUrl} />;
  }

  // Gate every authenticated marketplace page behind a linked player record.
  // Fresh Google sign-ups land here with linkedPlayerId === null and must
  // finish the gender + skill self-assessment before they can access anything
  // else. Existing email/password users always have a linkedPlayerId set
  // during signup, so this is a no-op for them.
  if (
    user &&
    user.linkedPlayerId === null &&
    !PROFILE_INCOMPLETE_ALLOWLIST.includes(location)
  ) {
    const completeUrl =
      location && location !== '/marketplace/complete-profile'
        ? `/marketplace/complete-profile?from=${encodeURIComponent(location)}`
        : '/marketplace/complete-profile';
    return <Redirect to={completeUrl} />;
  }

  return <>{children}</>;
}
