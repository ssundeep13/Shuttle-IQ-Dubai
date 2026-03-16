import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { MarketplaceLayout } from '@/pages/marketplace/MarketplaceLayout';
import MarketplaceHome from '@/pages/marketplace/MarketplaceHome';

export function RootRedirect() {
  const { user: adminUser, isLoading: adminLoading } = useAuth();
  const { isAuthenticated: mpAuthenticated, isLoading: mpLoading } = useMarketplaceAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!adminLoading && adminUser) {
      navigate('/admin/sessions', { replace: true });
    } else if (!mpLoading && mpAuthenticated && !adminUser) {
      navigate('/marketplace/dashboard', { replace: true });
    }
  }, [adminUser, adminLoading, mpAuthenticated, mpLoading, navigate]);

  if (adminLoading || mpLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (adminUser || mpAuthenticated) {
    return null;
  }

  return (
    <MarketplaceLayout>
      <MarketplaceHome />
    </MarketplaceLayout>
  );
}
