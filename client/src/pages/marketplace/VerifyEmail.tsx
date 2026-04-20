import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useQueryClient } from '@tanstack/react-query';

type Status = 'verifying' | 'success' | 'error' | 'missing';

export default function VerifyEmail() {
  usePageTitle('Verify Email');
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useMarketplaceAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setStatus('missing');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/marketplace/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMsg(data.error || 'Verification failed');
          setStatus('error');
          return;
        }
        setStatus('success');
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      } catch {
        setErrorMsg('Could not reach the server. Please try again.');
        setStatus('error');
      }
    })();
  }, [queryClient]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {status === 'verifying' && (
            <>
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
              <CardTitle data-testid="text-verify-title">Verifying your email…</CardTitle>
              <CardDescription>This will only take a moment.</CardDescription>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle data-testid="text-verify-success">Email verified!</CardTitle>
              <CardDescription>You can now link your ShuttleIQ player profile from the Profile page.</CardDescription>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle data-testid="text-verify-error">Verification failed</CardTitle>
              <CardDescription data-testid="text-verify-error-msg">{errorMsg}</CardDescription>
            </>
          )}
          {status === 'missing' && (
            <>
              <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Missing verification link</CardTitle>
              <CardDescription>This page expects a verification token in the URL.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {status === 'success' && (
            isAuthenticated ? (
              <Button onClick={() => setLocation('/marketplace/profile')} data-testid="button-go-profile">
                Go to my profile
              </Button>
            ) : (
              <Button onClick={() => setLocation('/marketplace/login')} data-testid="button-go-login">
                Log in
              </Button>
            )
          )}
          {(status === 'error' || status === 'missing') && (
            <>
              {isAuthenticated && (
                <Button asChild data-testid="button-go-profile-error">
                  <Link href="/marketplace/profile">Request a new verification email</Link>
                </Button>
              )}
              <Button variant="ghost" asChild>
                <Link href="/marketplace">Back to marketplace</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
