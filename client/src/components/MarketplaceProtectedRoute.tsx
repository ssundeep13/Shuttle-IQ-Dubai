import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Redirect, useLocation } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

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

  // Onboarding redirect (Task #237). Any signed-in marketplace user who hasn't
  // completed (or skipped) the skill quiz is funneled through it before they
  // can reach any other auth-gated page. The `/marketplace/onboarding` route
  // itself is excluded so the quiz can render. `onboardingCompleted` is treated
  // as "true" if the field is missing so older clients/mocked tests don't get
  // stuck in a redirect loop.
  if (
    user &&
    user.onboardingCompleted === false &&
    location !== '/marketplace/onboarding'
  ) {
    return <Redirect to="/marketplace/onboarding" />;
  }

  return <>{children}</>;
}
