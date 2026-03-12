import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Redirect } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

export function MarketplaceProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useMarketplaceAuth();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/marketplace/login" />;
  }

  return <>{children}</>;
}
