import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = new URLSearchParams(window.location.search).get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('POST', '/api/marketplace/auth/reset-password', { token, password });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>Choose a new password for your account</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <XCircle className="h-10 w-10 text-destructive" />
              <div>
                <p className="font-medium mb-1">Invalid reset link</p>
                <p className="text-sm text-muted-foreground">This link is missing required information.</p>
              </div>
              <Link href="/marketplace/login">
                <Button variant="outline" size="sm" data-testid="button-back-login">Back to Login</Button>
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="font-medium mb-1">Password updated!</p>
                <p className="text-sm text-muted-foreground">You can now log in with your new password.</p>
              </div>
              <Button
                className="mt-2"
                onClick={() => setLocation('/marketplace/login')}
                data-testid="button-go-login"
              >
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    required
                    data-testid="input-new-password"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-9"
                    required
                    data-testid="input-confirm-password"
                  />
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20" data-testid="text-reset-error">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset-password">
                {loading ? 'Updating...' : 'Set New Password'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/marketplace/login" className="hover:underline" data-testid="link-back-login">
                  Back to Login
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
