import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { MarketplaceLayout } from '@/pages/marketplace/MarketplaceLayout';
import MarketplaceHome from '@/pages/marketplace/MarketplaceHome';

export function RootRedirect() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/admin/sessions', { replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <MarketplaceLayout>
      <MarketplaceHome />
    </MarketplaceLayout>
  );
}
