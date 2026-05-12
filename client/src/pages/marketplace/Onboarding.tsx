import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  computeOnboardingScore,
  getTierDisplayName,
  type OnboardingAnswer,
} from '@shared/utils/skillUtils';
import { Loader2, Trophy } from 'lucide-react';

type AnswerState = OnboardingAnswer | null;

const QUESTIONS: Array<{
  key: 'experience' | 'rallies' | 'games';
  title: string;
  options: string[];
}> = [
  {
    key: 'experience',
    title: 'Your experience with badminton',
    options: [
      'I have never played badminton before',
      'I have played casually a few times',
      'I play regularly, monthly or more',
      'I play competitively or have had coaching',
    ],
  },
  {
    key: 'rallies',
    title: 'How rallies usually go for you',
    options: [
      'I am still learning to keep the shuttle in play',
      'I can sustain short rallies consistently',
      'I can sustain long rallies and place shots deliberately',
      'I play tactical shots and can control the game',
    ],
  },
  {
    key: 'games',
    title: 'Match play experience',
    options: [
      'I have never played a proper game',
      'I have played a few informal games',
      'I play regular games and understand scoring',
      'I compete in leagues or tournaments',
    ],
  },
];

export default function Onboarding() {
  usePageTitle('Welcome to ShuttleIQ');
  const { user } = useMarketplaceAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isRetake = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('retake') === '1';
  }, []);

  const [experience, setExperience] = useState<AnswerState>(null);
  const [rallies, setRallies] = useState<AnswerState>(null);
  const [games, setGames] = useState<AnswerState>(null);

  // Prefill from previous answers when retaking.
  useEffect(() => {
    if (!isRetake || !user?.onboardingAnswers) return;
    const a = user.onboardingAnswers;
    setExperience((a.experience as OnboardingAnswer) ?? null);
    setRallies((a.rallies as OnboardingAnswer) ?? null);
    setGames((a.games as OnboardingAnswer) ?? null);
  }, [isRetake, user?.onboardingAnswers]);

  const allAnswered = experience != null && rallies != null && games != null;

  const preview = useMemo(() => {
    if (!allAnswered) return null;
    return computeOnboardingScore([
      experience as OnboardingAnswer,
      rallies as OnboardingAnswer,
      games as OnboardingAnswer,
    ]);
  }, [allAnswered, experience, rallies, games]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ score: number; tier: string }>('POST', '/api/marketplace/onboarding', {
        experience,
        rallies,
        games,
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Skill level set',
        description: `Starting tier: ${getTierDisplayName(data.tier)} (${data.score}).`,
      });
      // Optimistically flip onboardingCompleted in the cached /auth/me payload
      // so the protected-route guard does not bounce us back to onboarding
      // before the refetch lands. The invalidate then refreshes the rest.
      queryClient.setQueryData<any>(['/api/marketplace/auth/me'], (prev: any) =>
        prev
          ? {
              ...prev,
              onboardingCompleted: true,
              onboardingAnswers: { experience, rallies, games },
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      setLocation(isRetake ? '/marketplace/profile' : '/marketplace/dashboard');
    },
    onError: (err: any) => {
      const msg = err?.error || err?.message || 'Could not save your answers';
      if (msg === 'gameplay_score_locked') {
        toast({
          title: "You've already played a game",
          description: 'Your skill level is now driven by gameplay and can no longer be set from the quiz.',
          variant: 'destructive',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
        setLocation('/marketplace/profile');
        return;
      }
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/marketplace/onboarding', { skip: true });
    },
    onSuccess: () => {
      toast({ title: 'Skipped — you can start exploring' });
      // Same optimistic flip as the submit path so the redirect guard does not
      // immediately bounce us back here on the next render.
      queryClient.setQueryData<any>(['/api/marketplace/auth/me'], (prev: any) =>
        prev ? { ...prev, onboardingCompleted: true, onboardingAnswers: null } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/auth/me'] });
      setLocation('/marketplace/dashboard');
    },
    onError: (err: any) => {
      toast({
        title: 'Could not skip',
        description: err?.error || err?.message || 'Try again',
        variant: 'destructive',
      });
    },
  });

  const isSubmitting = submitMutation.isPending || skipMutation.isPending;

  // Page-level access gate. If the user has already completed onboarding and
  // is *not* in retake mode, send them away — the quiz is not retakable in
  // that state and the server will reject any submission anyway.
  if (
    user?.onboardingCompleted &&
    !isRetake &&
    !submitMutation.isPending &&
    !skipMutation.isPending
  ) {
    return <Redirect to="/marketplace/dashboard" />;
  }
  // If the user is in retake mode but is no longer eligible (e.g. they
  // skipped originally, or have already played a game), bounce to profile.
  if (isRetake && user && !user.canRetakeOnboarding) {
    return <Redirect to="/marketplace/profile" />;
  }

  const setAnswer = (key: 'experience' | 'rallies' | 'games', val: OnboardingAnswer) => {
    if (key === 'experience') setExperience(val);
    else if (key === 'rallies') setRallies(val);
    else setGames(val);
  };

  const valueFor = (key: 'experience' | 'rallies' | 'games'): AnswerState =>
    key === 'experience' ? experience : key === 'rallies' ? rallies : games;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-onboarding-title">
          {isRetake ? 'Update your starting skill level' : 'Welcome — let’s set your skill level'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Three quick questions help us seed your starting score so your first matches are fair.
          {isRetake && ' Once you play your first game this option goes away.'}
        </p>
      </div>

      <div className="space-y-4">
        {QUESTIONS.map((q, qIdx) => (
          <Card key={q.key} data-testid={`card-question-${q.key}`}>
            <CardHeader>
              <CardTitle className="text-base">
                {qIdx + 1}. {q.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={valueFor(q.key) != null ? String(valueFor(q.key)) : ''}
                onValueChange={(v) => setAnswer(q.key, Number(v) as OnboardingAnswer)}
                className="space-y-2"
              >
                {q.options.map((opt, idx) => {
                  const val = (idx + 1) as OnboardingAnswer;
                  const id = `q-${q.key}-${val}`;
                  return (
                    <div key={id} className="flex items-start gap-3 rounded-md border p-3 hover-elevate">
                      <RadioGroupItem
                        value={String(val)}
                        id={id}
                        data-testid={`radio-${q.key}-${val}`}
                      />
                      <Label htmlFor={id} className="text-sm font-normal cursor-pointer flex-1">
                        {opt}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4" data-testid="card-preview">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-secondary" /> Starting tier preview
          </CardTitle>
          <CardDescription>
            Your starting skill score is hard-capped at 95. Higher tiers are unlocked through gameplay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview ? (
            <div className="flex items-center gap-2" data-testid="text-preview-tier">
              <Badge variant="secondary" className="text-sm">
                {getTierDisplayName(preview.tier)}
              </Badge>
              <span className="text-sm text-muted-foreground">Score {preview.score}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-preview-empty">
              Answer all three questions to see your starting tier.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        {!isRetake && (
          <Button
            variant="ghost"
            onClick={() => skipMutation.mutate()}
            disabled={isSubmitting}
            data-testid="button-skip-onboarding"
          >
            Skip for now
          </Button>
        )}
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={!allAnswered || isSubmitting}
          data-testid="button-submit-onboarding"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            'Save & continue'
          )}
        </Button>
      </div>
    </div>
  );
}
