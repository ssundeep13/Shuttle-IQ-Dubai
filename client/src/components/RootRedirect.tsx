import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { MarketplaceLayout } from '@/pages/marketplace/MarketplaceLayout';
import MarketplaceHome from '@/pages/marketplace/MarketplaceHome';
import { Wordmark } from '@/components/Wordmark';

// Branded shell shown while auth resolves AND during the redirect frame — the
// old version painted an unbranded "Loading..." and then a completely blank
// viewport (return null) before every authenticated session's first screen.
function RootShell() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-3"
      style={{ background: 'hsl(var(--background))' }}
      data-testid="root-loading"
    >
      <Wordmark size={28} />
      <div className="h-1 w-24 overflow-hidden rounded-full" style={{ background: 'rgba(0,30,70,0.10)' }}>
        <div className="h-full w-1/3 rounded-full animate-pulse" style={{ background: 'hsl(var(--secondary))' }} />
      </div>
    </div>
  );
}

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

  if (adminLoading || mpLoading || adminUser || mpAuthenticated) {
    return <RootShell />;
  }

  return (
    <MarketplaceLayout>
      <MarketplaceHome />
    </MarketplaceLayout>
  );
}
