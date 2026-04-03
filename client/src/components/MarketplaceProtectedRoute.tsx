import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Redirect, useLocation } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

export function MarketplaceProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useMarketplaceAuth();
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

  return <>{children}</>;
}
