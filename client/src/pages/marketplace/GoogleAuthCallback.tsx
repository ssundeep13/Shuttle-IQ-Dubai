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

    let remember = true;
    try {
      remember = localStorage.getItem('mp_remember') !== 'false';
    } catch {
      // ignore
    }

    loginWithTokens(accessToken, refreshToken, remember)
      .then(async () => {
        toast({ title: 'Signed in with Google!' });
        // If this Google sign-in is a brand-new account (or any account that
        // hasn't completed the onboarding skill quiz yet), funnel them through
        // /marketplace/onboarding before returning them to their original
        // destination. The protected-route guard would catch this anyway, but
        // doing it explicitly here keeps the post-sign-in URL clean.
        try {
          const res = await fetch('/api/marketplace/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (res.ok) {
            const me = await res.json();
            if (me?.onboardingCompleted === false) {
              setLocation('/marketplace/onboarding');
              return;
            }
          }
        } catch {
          // Non-fatal — fall through to the normal destination.
        }
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
