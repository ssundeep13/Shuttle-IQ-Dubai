import { useLocation } from 'wouter';
import { useState } from 'react';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isFullName } from '@shared/utils/playerMatching';
import {
  SkillAssessmentStepper,
  type AssessmentAnswers,
  type Gender,
} from '@/components/marketplace/SkillAssessmentStepper';

export default function CompleteProfile() {
  usePageTitle('Complete Your Profile');
  const { user, completeProfile } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  // P1 full-name policy: Google can hand us a single-word name; collect the
  // full name here so the server doesn't reject player creation. Hidden for
  // users whose account name already has first + last.
  const needsFullName = !isFullName(user?.name ?? '');
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSubmit = async ({
    gender,
    assessmentAnswers,
  }: {
    gender: Gender;
    assessmentAnswers: AssessmentAnswers;
  }) => {
    if (needsFullName && !isFullName(fullName)) {
      // Inline at the field, not a toast fired four assessment steps after the
      // name was typed (§16: validate inline). Scroll back up to it — the
      // stepper has moved the page well past the input by submit time.
      setNameError('Please enter your full name (first and last)');
      const el = document.getElementById('complete-profile-full-name');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await completeProfile({
        gender,
        assessmentAnswers,
        ...(needsFullName ? { fullName } : {}),
      });
      toast({ title: "You're all set!", description: 'Welcome to ShuttleIQ.' });

      // Honor the original destination if the user landed here via the
      // protected-route gate (e.g. /marketplace/dashboard?from=...).
      const params = new URLSearchParams(window.location.search);
      const from = params.get('from');
      const destination = from && from.startsWith('/marketplace/') && from !== '/marketplace/complete-profile'
        ? from
        : '/marketplace/dashboard';
      setLocation(destination);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete profile';
      toast({ title: 'Something went wrong', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8"
      style={{ background: '#F2ECE1', color: '#1A1F2B', fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-4">
        {needsFullName && (
          <div className="w-full space-y-2">
            <Label htmlFor="complete-profile-full-name">Full name</Label>
            <Input
              id="complete-profile-full-name"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); if (nameError) setNameError(null); }}
              onBlur={() => { if (fullName.trim() && !isFullName(fullName)) setNameError('Please enter your full name (first and last)'); }}
              placeholder="First and last name"
              autoComplete="name"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'complete-profile-name-error' : undefined}
              data-testid="input-complete-profile-full-name"
            />
            {nameError && (
              <p id="complete-profile-name-error" className="text-xs text-destructive" role="alert" data-testid="error-name">{nameError}</p>
            )}
          </div>
        )}
        <SkillAssessmentStepper
          title={user?.name ? `Welcome, ${user.name}!` : 'Almost there!'}
          description="A quick 4-step setup so we can match you with the right players."
          onSubmit={handleSubmit}
          isSubmitting={submitting}
        />
      </div>
    </div>
  );
}
