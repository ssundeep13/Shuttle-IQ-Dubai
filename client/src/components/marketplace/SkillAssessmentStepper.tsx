import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft } from 'lucide-react';

export type Gender = 'Male' | 'Female';
export type AssessmentAnswer = 1 | 2 | 3 | 4;
export type AssessmentAnswers = [AssessmentAnswer, AssessmentAnswer, AssessmentAnswer];

interface AssessmentQuestion {
  key: 'q1' | 'q2' | 'q3';
  title: string;
  options: { value: AssessmentAnswer; label: string }[];
}

const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  {
    key: 'q1',
    title: 'How long have you been playing badminton?',
    options: [
      { value: 1, label: 'Just starting out (less than 6 months)' },
      { value: 2, label: 'Casually for 6 months to 2 years' },
      { value: 3, label: 'Regularly for 2-5 years' },
      { value: 4, label: '5+ years, competitive experience' },
    ],
  },
  {
    key: 'q2',
    title: 'How often do you play right now?',
    options: [
      { value: 1, label: 'Rarely — a few times a year' },
      { value: 2, label: 'Once or twice a month' },
      { value: 3, label: 'Once a week' },
      { value: 4, label: 'Multiple times a week' },
    ],
  },
  {
    key: 'q3',
    title: 'How would you describe your shot control?',
    options: [
      { value: 1, label: "I'm still learning the basics" },
      { value: 2, label: 'I can rally consistently on easy shots' },
      { value: 3, label: 'I can control clears, drops, and smashes' },
      { value: 4, label: 'I play tactically with deception and placement' },
    ],
  },
];

export type InternalStep = 'gender' | 'q1' | 'q2' | 'q3';
const STEP_ORDER: InternalStep[] = ['gender', 'q1', 'q2', 'q3'];

export interface SkillAssessmentStepperProps {
  /** Header title shown at the top of the gender card. */
  title: string;
  /** Subtitle shown under the title on the gender card. */
  description?: string;
  /** Total step count to display in the "Step X of N" hint. Useful when the
   *  stepper is embedded inside a wider flow that has its own steps before
   *  or after. Defaults to STEP_ORDER.length (4: gender + 3 questions). */
  totalSteps?: number;
  /** Where the stepper currently sits in the wider flow. 1-indexed offset
   *  added to the internal step index before rendering. Default 0. */
  stepOffset?: number;
  /** Called when the user clicks Back on the very first step (gender). If
   *  undefined, the back button on the first step is hidden. */
  onBackFromFirstStep?: () => void;
  /** Final submit handler — called once all four answers are collected. The
   *  button label uses isSubmitting to render a busy state. */
  onSubmit: (payload: { gender: Gender; assessmentAnswers: AssessmentAnswers }) => void | Promise<void>;
  /** Disables the final submit button + selection while the parent is in flight. */
  isSubmitting?: boolean;
  /** Optional initial step to mount on. Used when the user navigates back
   *  into the stepper from a downstream phase (e.g. referral) and we want
   *  to resume on q3 instead of resetting to gender. */
  initialStep?: InternalStep;
  /** Optional initial gender to pre-select. */
  initialGender?: Gender;
  /** Optional initial answers to pre-fill the three skill questions with. */
  initialAnswers?: AssessmentAnswers;
}

/**
 * Shared 4-step gender + 3-question skill self-assessment used by both the
 * email/password signup flow and the Google "complete your profile" flow.
 *
 * The component owns its internal step state and the user's selections.
 * Selecting an answer auto-advances to the next question; the final question
 * triggers onSubmit. A Back button steps backwards through the flow without
 * losing prior answers.
 */
export function SkillAssessmentStepper({
  title,
  description,
  totalSteps,
  stepOffset = 0,
  onBackFromFirstStep,
  onSubmit,
  isSubmitting = false,
  initialStep,
  initialGender,
  initialAnswers,
}: SkillAssessmentStepperProps) {
  const [step, setStep] = useState<InternalStep>(initialStep ?? 'gender');
  const [gender, setGender] = useState<Gender | ''>(initialGender ?? '');
  const [answers, setAnswers] = useState<{
    q1: AssessmentAnswer | null;
    q2: AssessmentAnswer | null;
    q3: AssessmentAnswer | null;
  }>({
    q1: initialAnswers?.[0] ?? null,
    q2: initialAnswers?.[1] ?? null,
    q3: initialAnswers?.[2] ?? null,
  });

  const stepIndex = STEP_ORDER.indexOf(step);
  const displayTotal = totalSteps ?? STEP_ORDER.length;
  const displayCurrent = stepOffset + stepIndex + 1;

  const goBack = () => {
    if (stepIndex > 0) {
      setStep(STEP_ORDER[stepIndex - 1]);
    } else if (onBackFromFirstStep) {
      onBackFromFirstStep();
    }
  };

  const handleAnswerSelect = (questionKey: 'q1' | 'q2' | 'q3', value: AssessmentAnswer) => {
    if (isSubmitting) return;
    const next = { ...answers, [questionKey]: value };
    setAnswers(next);
    if (questionKey === 'q3') {
      // Final answer — submit straight away.
      if (gender && next.q1 !== null && next.q2 !== null && next.q3 !== null) {
        void onSubmit({
          gender,
          assessmentAnswers: [next.q1, next.q2, next.q3] as AssessmentAnswers,
        });
      }
      return;
    }
    const idx = STEP_ORDER.indexOf(questionKey);
    setStep(STEP_ORDER[idx + 1]);
  };

  const handleGenderContinue = () => {
    if (!gender) return;
    setStep('q1');
  };

  const showBackButton = stepIndex > 0 || !!onBackFromFirstStep;

  // ----- Gender step -----
  if (step === 'gender') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            {showBackButton ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={goBack}
                disabled={isSubmitting}
                data-testid="button-step-back"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <span className="w-9" />
            )}
            <span className="text-xs text-muted-foreground" data-testid="text-step-progress">
              Step {displayCurrent} of {displayTotal}
            </span>
            <span className="w-9" />
          </div>
          <CardTitle className="mt-2 text-lg" data-testid="text-assessment-title">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assessment-gender">Gender</Label>
            <Select
              value={gender}
              onValueChange={(v) => setGender(v as Gender)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="assessment-gender" data-testid="select-gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male" data-testid="option-gender-male">Male</SelectItem>
                <SelectItem value="Female" data-testid="option-gender-female">Female</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used to balance teams in mixed-doubles matchmaking.
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={!gender || isSubmitting}
            onClick={handleGenderContinue}
            data-testid="button-continue-gender"
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ----- Question step (q1/q2/q3) -----
  const q = ASSESSMENT_QUESTIONS.find((x) => x.key === step)!;
  const selected = answers[q.key];
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={goBack}
            disabled={isSubmitting}
            data-testid="button-step-back"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground" data-testid="text-step-progress">
            Step {displayCurrent} of {displayTotal}
          </span>
          <span className="w-9" />
        </div>
        <CardTitle className="mt-2 text-lg" data-testid={`text-question-title-${q.key}`}>
          {q.title}
        </CardTitle>
        <CardDescription>Pick the option that best describes you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.options.map((opt) => {
          const isSelected = selected === opt.value;
          return (
            <Button
              key={opt.value}
              variant={isSelected ? 'default' : 'outline'}
              className="w-full justify-start text-left whitespace-normal h-auto py-3"
              onClick={() => handleAnswerSelect(q.key, opt.value)}
              disabled={isSubmitting}
              data-testid={`button-answer-${q.key}-${opt.value}`}
            >
              <span className="text-sm">{opt.label}</span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
