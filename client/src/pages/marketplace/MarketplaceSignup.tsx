import { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'wouter';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, CheckCircle, Loader2, Gift, ChevronLeft } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  SkillAssessmentStepper,
  type AssessmentAnswers,
  type Gender,
} from '@/components/marketplace/SkillAssessmentStepper';

// Three flow phases:
//   form      → basic info (name/email/phone/password)
//   assessment → 4-step gender + 3-question stepper (handled by shared component)
//   referral  → final referral-code prompt before submitting
type Phase = 'form' | 'assessment' | 'referral';

// Used purely for the "Step X of 5" hint shown across the whole flow.
//   1: form, 2-5: gender + q1/q2/q3, (referral handled separately as step 5)
const TOTAL_STEPS = 5;

export default function MarketplaceSignup() {
  usePageTitle('Sign Up');
  const { signup } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [phase, setPhase] = useState<Phase>('form');
  const [collected, setCollected] = useState<{
    gender: Gender;
    assessmentAnswers: AssessmentAnswers;
  } | null>(null);

  const [referralCode, setReferralCode] = useState('');
  const [referralValidating, setReferralValidating] = useState(false);
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [promo, setPromo] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefillEmail = params.get('email');
    if (prefillEmail) setEmail(prefillEmail);
    const refCode = params.get('ref');
    if (refCode) setReferralCode(refCode);
    const promoCode = params.get('promo');
    if (promoCode) setPromo(promoCode);
  }, []);

  const validateReferralCode = useCallback(async (code: string) => {
    if (!code.trim()) {
      setReferrerName(null);
      setReferralError(null);
      return;
    }
    setReferralValidating(true);
    setReferralError(null);
    setReferrerName(null);
    try {
      const res = await fetch(`/api/referrals/validate/${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (data.valid) {
        setReferrerName(data.referrerName);
      } else {
        setReferralError('Invalid referral code');
      }
    } catch {
      setReferralError('Could not validate code');
    } finally {
      setReferralValidating(false);
    }
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('assessment');
  };

  // Called by the shared stepper once gender + 3 answers are collected.
  // We *don't* submit the signup here — the user still needs to pass through
  // the referral-code step.
  const handleAssessmentComplete = ({
    gender,
    assessmentAnswers,
  }: {
    gender: Gender;
    assessmentAnswers: AssessmentAnswers;
  }) => {
    setCollected({ gender, assessmentAnswers });
    setPhase('referral');
  };

  const handleFinishSignup = async (code?: string) => {
    if (!collected) {
      toast({ title: 'Please complete all steps', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      let remember = true;
      try {
        remember = localStorage.getItem('mp_remember') !== 'false';
      } catch {
        // ignore
      }
      await signup({
        email,
        password,
        name,
        phone,
        gender: collected.gender,
        assessmentAnswers: collected.assessmentAnswers,
        referralCode: code,
        promo: promo || undefined,
        remember,
      });
      toast({ title: 'Account created!' });
      setLocation('/marketplace');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      toast({ title: 'Signup failed', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ----- Skill assessment phase (gender + 3 questions) -----
  if (phase === 'assessment') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
        <SkillAssessmentStepper
          title="Tell us about your game"
          description="A few quick questions so we can match you with the right players."
          totalSteps={TOTAL_STEPS}
          stepOffset={1}
          onBackFromFirstStep={() => setPhase('form')}
          onSubmit={handleAssessmentComplete}
        />
      </div>
    );
  }

  // ----- Referral step -----
  if (phase === 'referral') {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-between gap-2 mb-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setPhase('assessment')}
                disabled={loading}
                data-testid="button-step-back"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground" data-testid="text-step-progress">
                Step {TOTAL_STEPS} of {TOTAL_STEPS}
              </span>
              <span className="w-9" />
            </div>
            <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-[rgba(0,107,95,0.1)] flex items-center justify-center">
              <Gift className="h-6 w-6 text-[#006B5F]" />
            </div>
            <CardTitle data-testid="text-referral-title">Were you referred?</CardTitle>
            <CardDescription>
              If a friend shared their referral code with you, enter it below. You can also skip this step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {promo === 'jersey15' && !referralCode.trim() && (
              <div
                className="flex items-center gap-2 rounded-md border border-[#00BFA5]/30 bg-[#00BFA5]/10 px-3 py-2 text-sm text-[#006B5F]"
                data-testid="banner-jersey-credit"
              >
                <Gift className="h-4 w-4 shrink-0" />
                <span>AED 15 welcome credit will be added to your wallet.</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="referral-code">Referral Code</Label>
              <Input
                id="referral-code"
                placeholder="e.g. SIQ-JOHN00-00123"
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value);
                  setReferrerName(null);
                  setReferralError(null);
                }}
                onBlur={() => validateReferralCode(referralCode)}
                data-testid="input-referral-code"
              />
              {referralValidating && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Validating...
                </div>
              )}
              {referrerName && (
                <div className="flex items-center gap-1.5 text-xs text-[#006B5F] font-medium" data-testid="text-referrer-name">
                  <CheckCircle className="h-3.5 w-3.5" /> Referred by {referrerName}
                </div>
              )}
              {referralError && (
                <p className="text-xs text-destructive" data-testid="text-referral-error">{referralError}</p>
              )}
            </div>

            <Button
              className="w-full"
              disabled={loading || referralValidating || (!!referralCode.trim() && !referrerName)}
              onClick={() => handleFinishSignup(referralCode.trim() || undefined)}
              data-testid="button-continue-referral"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              disabled={loading}
              onClick={() => handleFinishSignup()}
              data-testid="button-skip-referral"
            >
              Skip
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ----- Basic info step (default) -----
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <span className="text-xs text-muted-foreground mb-1" data-testid="text-step-progress">
            Step 1 of {TOTAL_STEPS}
          </span>
          <CardTitle data-testid="text-signup-title">Create Account</CardTitle>
          <CardDescription>Join the ShuttleIQ community</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 mb-2"
            onClick={() => {
              const url = promo
                ? `/api/marketplace/auth/google?promo=${encodeURIComponent(promo)}`
                : '/api/marketplace/auth/google';
              window.location.href = url;
            }}
            data-testid="button-google-signup"
          >
            <SiGoogle className="h-4 w-4" />
            Continue with Google
          </Button>
          <p className="text-xs text-muted-foreground text-center mb-4">
            Google sign-up doesn't require a phone number. You can add it later in your profile.
          </p>
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or sign up with email</span>
            </div>
          </div>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                data-testid="input-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+971 50 000 0000"
                data-testid="input-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
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
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-submit-signup"
            >
              Continue
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <Link href="/marketplace/login" className="text-primary hover:underline" data-testid="link-login">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
