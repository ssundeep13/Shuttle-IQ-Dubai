import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function GoogleAuthCallback() {
  usePageTitle('Signing In');
  const { loginWithTokens } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const error = params.get('error');

    if (error || !accessToken || !refreshToken) {
      toast({ title: 'Google sign-in failed', description: 'Please try again.', variant: 'destructive' });
      setLocation('/marketplace/login');
      return;
    }

    const returnPath = params.get('returnPath');
    const destination = returnPath && returnPath.startsWith('/marketplace/') ? returnPath : '/marketplace/dashboard';

    loginWithTokens(accessToken, refreshToken)
      .then(() => {
        toast({ title: 'Signed in with Google!' });
        setLocation(destination);
      })
      .catch(() => {
        toast({ title: 'Sign-in failed', description: 'Please try again.', variant: 'destructive' });
        setLocation('/marketplace/login');
      });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
