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
import { Mail, Eye, EyeOff } from 'lucide-react';

function ForgotPasswordForm() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest('POST', '/api/marketplace/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
          <Mail className="h-6 w-6 text-secondary" />
        </div>
        <div>
          <p className="font-medium mb-1">Check your inbox</p>
          <p className="text-sm text-muted-foreground">
            If <span className="font-medium">{email}</span> is registered, you'll receive a password reset link shortly. The link expires in 1 hour.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => { setSubmitted(false); setEmail(''); }}
          data-testid="button-try-another-email"
        >
          Try a different email
        </button>
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
  const [showPassword, setShowPassword] = useState(false);

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
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      data-testid="input-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-toggle-password"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
