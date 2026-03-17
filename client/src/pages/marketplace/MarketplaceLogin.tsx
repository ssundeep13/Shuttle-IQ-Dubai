import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, Mail } from 'lucide-react';

function ForgotPasswordForm() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotFound(false);
    try {
      const data: any = await apiRequest('POST', '/api/marketplace/auth/forgot-password', { email });
      if (data?.resetUrl) {
        setResetUrl(data.resetUrl);
      } else {
        setNotFound(true);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (resetUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-secondary" />
        </div>
        <div>
          <p className="font-medium mb-1">Your reset link is ready</p>
          <p className="text-sm text-muted-foreground mb-3">Click the button below to set a new password. This link expires in 1 hour.</p>
        </div>
        <Link href={resetUrl} className="w-full">
          <Button className="w-full gap-2" data-testid="button-open-reset-link">
            Reset My Password
          </Button>
        </Link>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => { setResetUrl(null); setEmail(''); }}
          data-testid="button-try-another-email"
        >
          Use a different email
        </button>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Mail className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium mb-1">No account found</p>
          <p className="text-sm text-muted-foreground">There's no account registered with that email address.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setNotFound(false)} data-testid="button-try-again">
          Try a different email
        </Button>
        <Link href="/marketplace/signup">
          <button type="button" className="text-xs text-secondary hover:underline" data-testid="link-signup-instead">
            Create an account instead
          </button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">
          Enter the email address for your account and we'll send a reset link.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            id="forgot-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9"
            required
            data-testid="input-forgot-email"
          />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="button-send-reset">
        {loading ? 'Sending...' : 'Send Reset Link'}
      </Button>
    </form>
  );
}

export default function MarketplaceLogin() {
  const { login } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast({ title: 'Welcome back!' });
      setLocation('/marketplace');
    } catch (err: any) {
      toast({ title: 'Login failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle data-testid="text-login-title">Welcome back</CardTitle>
          <CardDescription>Sign in to your ShuttleIQ account</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full mb-6">
              <TabsTrigger value="login" className="flex-1" data-testid="tab-login">Log In</TabsTrigger>
              <TabsTrigger value="forgot" className="flex-1" data-testid="tab-forgot-password">Forgot Password</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit-login">
                  {loading ? 'Logging in...' : 'Log In'}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Don't have an account?{' '}
                <Link href="/marketplace/signup" className="text-secondary hover:underline" data-testid="link-signup">
                  Sign up
                </Link>
              </p>
            </TabsContent>

            <TabsContent value="forgot">
              <ForgotPasswordForm />
            </TabsContent>
          </Tabs>

          <p className="text-center text-xs text-muted-foreground mt-6">
            <Link href="/admin/login" className="hover:underline" data-testid="link-admin-login">
              Staff login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
