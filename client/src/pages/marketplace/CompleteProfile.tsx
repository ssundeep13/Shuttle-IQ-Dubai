import { useLocation } from 'wouter';
import { useState } from 'react';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
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

  const handleSubmit = async ({
    gender,
    assessmentAnswers,
  }: {
    gender: Gender;
    assessmentAnswers: AssessmentAnswers;
  }) => {
    setSubmitting(true);
    try {
      await completeProfile({ gender, assessmentAnswers });
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
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="w-full flex justify-center">
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
