// The one "couldn't load — retry" surface for customer pages.
//
// Every customer query used to default to [] and render its EMPTY state on
// failure, so an outage read as "No bookings yet" / "No sessions scheduled
// right now — check back soon" — a confident, wrong statement. This card is
// what an errored query renders instead: honest copy and a way back.
import { AlertCircle, RefreshCw } from 'lucide-react';

export function QueryErrorCard({
  message,
  onRetry,
  testId = 'query-error',
  compact = false,
}: {
  message: string;
  onRetry?: () => void;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`rounded-[14px] border border-destructive/30 bg-destructive/5 text-foreground ${compact ? 'p-4' : 'p-6 text-center'}`}
    >
      <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col items-center gap-2'}`}>
        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <p className="text-sm text-foreground m-0">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className={`siq-press inline-flex items-center justify-center gap-2 rounded-[10px] border border-primary/30 bg-card px-4 min-h-11 text-sm font-semibold text-primary ${compact ? 'ml-auto' : 'mt-2'}`}
            data-testid={`${testId}-retry`}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
