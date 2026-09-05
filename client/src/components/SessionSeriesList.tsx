// Recurring series management. Lists every live weekly series and lets an
// admin stop one or extend one.
//
// Stopping is not a delete-all: sessions that already have bookings are kept,
// because removing them would strand real players (and the database would not
// stop us — almost nothing hangs off a session by foreign key). So the confirm
// dialog is built from a server-computed preview and states plainly what will
// go and what will stay, before anything happens.
//
// Extending adds N more weekly sessions to the END of a series, copied from
// its latest session. The preview dates come from the same string-only helper
// the server uses, so what the admin reads is exactly what gets created.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Loader2, AlertCircle, Clock, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  formatPreviewDate, extensionDates, seriesEndLabel,
  EXTEND_WEEKS_MIN, EXTEND_WEEKS_MAX, EXTEND_WEEKS_DEFAULT,
} from "@shared/utils/seriesDates";

interface SeriesListItem {
  id: string;
  venueName: string;
  weekday: string;
  startTime: string;
  endTime: string;
  originDate: string;
  weeksAhead: number;
  totalSessions: number;
  draftCount: number;
  upcomingCount: number;
  otherCount: number;
  bookedSessions: number;
  stoppedAt: string | null;
  /** Last session date in the series (YYYY-MM-DD), computed from rows. */
  endsDate: string | null;
  /** Dubai calendar day the series was stopped (YYYY-MM-DD), or null. */
  stoppedDate: string | null;
}
interface StopRow { opsId: string; bookableId: string | null; dateIso: string; bookingCount: number; reason?: string }
interface StopPlan { remove: StopRow[]; keep: (StopRow & { reason: string })[] }
interface ExtendResult { seriesId: string; added: number; dates: string[]; endsDate: string; costsCopied: boolean; note: string | null }

/** "5 sessions (1 draft + 4 upcoming)" — the admin created 5 Tuesdays, so the
 *  count says 5, with the breakdown shown rather than a bare total. */
function sessionCountLabel(s: SeriesListItem): string {
  const parts: string[] = [];
  if (s.draftCount > 0) parts.push(`${s.draftCount} draft`);
  if (s.upcomingCount > 0) parts.push(`${s.upcomingCount} upcoming`);
  if (s.otherCount > 0) parts.push(`${s.otherCount} finished`);
  const noun = s.totalSessions === 1 ? 'session' : 'sessions';
  return parts.length > 0 ? `${s.totalSessions} ${noun} (${parts.join(' + ')})` : `${s.totalSessions} ${noun}`;
}

/** The server's error body, if apiRequest wrapped one into the message. */
function apiErrorText(err: unknown): string {
  const anyErr = err as { error?: unknown; message?: unknown };
  if (typeof anyErr?.error === 'string') return anyErr.error;
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : String(err);
  const json = msg.match(/\{[\s\S]*\}/);
  if (json) {
    try { const parsed = JSON.parse(json[0]); if (typeof parsed?.error === 'string') return parsed.error; } catch {}
  }
  return msg;
}

const WEEK_OPTIONS = Array.from({ length: EXTEND_WEEKS_MAX - EXTEND_WEEKS_MIN + 1 }, (_, i) => EXTEND_WEEKS_MIN + i);

export function SessionSeriesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showStopped, setShowStopped] = useState(false);
  const [target, setTarget] = useState<SeriesListItem | null>(null);
  const [extendTarget, setExtendTarget] = useState<SeriesListItem | null>(null);
  const [weeks, setWeeks] = useState<number>(EXTEND_WEEKS_DEFAULT);
  const [extendError, setExtendError] = useState<string | null>(null);

  // Stopped series stay hidden unless asked for. The default key is the plain
  // path so the stop mutation's prefix invalidation covers both variants.
  const { data: series = [], isLoading } = useQuery<SeriesListItem[]>({
    queryKey: showStopped ? ['/api/sessions/series', 'all'] : ['/api/sessions/series'],
    queryFn: () => apiRequest('GET', showStopped ? '/api/sessions/series?includeStopped=true' : '/api/sessions/series'),
  });

  // The preview is fetched fresh when the dialog opens, so what the admin reads
  // reflects bookings made since the page loaded.
  const { data: plan, isLoading: planLoading } = useQuery<StopPlan>({
    queryKey: ['/api/sessions/series', target?.id, 'stop-preview'],
    queryFn: () => apiRequest('GET', `/api/sessions/series/${target!.id}/stop-preview`),
    enabled: !!target,
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => apiRequest('POST', `/api/sessions/series/${id}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/series'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setTarget(null);
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, weeks: n }: { id: string; weeks: number }) =>
      apiRequest<ExtendResult>('POST', `/api/sessions/series/${id}/extend`, { weeks: n }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions/series'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setExtendTarget(null);
      setExtendError(null);
      toast({
        title: `Added ${r.added} session${r.added === 1 ? '' : 's'} — now ends ${formatPreviewDate(r.endsDate)}`,
        description: r.costsCopied ? undefined : 'Costs not copied — none on the template session.',
      });
    },
    onError: (err) => setExtendError(apiErrorText(err)),
  });

  const openExtend = (s: SeriesListItem) => {
    setWeeks(EXTEND_WEEKS_DEFAULT);
    setExtendError(null);
    setExtendTarget(s);
  };

  // Preview from the same helper the server writes with. A series always has
  // at least its origin row, so endsDate is only null for a broken record.
  const previewDates = extendTarget
    ? extensionDates(extendTarget.endsDate ?? extendTarget.originDate, weeks)
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading repeating sessions...
      </div>
    );
  }

  const toggle = (
    <div className="flex items-center justify-end gap-2">
      <label htmlFor="switch-show-stopped-series" className="text-xs text-muted-foreground">Show stopped series</label>
      <Switch
        id="switch-show-stopped-series"
        checked={showStopped}
        onCheckedChange={setShowStopped}
        data-testid="switch-show-stopped-series"
        aria-label="Show stopped series"
      />
    </div>
  );

  if (series.length === 0) {
    return (
      <div className="space-y-3">
        {toggle}
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              No repeating sessions yet. Turn on "Repeat every week" when you create a session to start one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="list-session-series">
      {toggle}
      {series.map((s) => {
        const stopped = !!s.stoppedAt;
        return (
          <Card key={s.id} className={stopped ? 'opacity-60' : undefined} data-testid={`card-series-${s.id}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                    <span className="truncate">Every {s.weekday}</span>
                  </CardTitle>
                  <CardDescription className="mt-1 space-y-0.5">
                    <span className="flex items-center gap-1.5 text-xs">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.venueName}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <Clock className="h-3 w-3 shrink-0" />
                      {s.startTime}–{s.endTime}
                    </span>
                  </CardDescription>
                </div>
                {stopped ? (
                  <Badge variant="outline" className="shrink-0">Stopped</Badge>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openExtend(s)}
                      data-testid={`button-extend-series-${s.id}`}
                    >
                      Add {EXTEND_WEEKS_DEFAULT} more {s.weekday}s
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTarget(s)}
                      data-testid={`button-stop-series-${s.id}`}
                    >
                      Stop series
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid={`text-series-count-${s.id}`}>{sessionCountLabel(s)}</Badge>
              {s.bookedSessions > 0 && (
                <Badge variant="outline">
                  {s.bookedSessions} with bookings
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                started {formatPreviewDate(s.originDate)}
                {(s.stoppedDate || s.endsDate) && (
                  <>
                    {' · '}
                    <span data-testid={stopped ? `text-series-stopped-${s.id}` : `text-series-ends-${s.id}`}>
                      {seriesEndLabel(s.endsDate, stopped ? s.stoppedDate : null)}
                    </span>
                  </>
                )}
              </span>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!target} onOpenChange={(open) => { if (!open) setTarget(null); }}>
        <AlertDialogContent data-testid="dialog-stop-series">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this repeating session?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {planLoading || !plan ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking which sessions have bookings...
                  </span>
                ) : (
                  <>
                    <p>No more sessions will be created for this series.</p>

                    {plan.remove.length > 0 ? (
                      <div>
                        <p className="font-medium text-foreground">
                          {plan.remove.length === 1 ? 'This session will be removed:' : `These ${plan.remove.length} sessions will be removed:`}
                        </p>
                        <p className="text-muted-foreground" data-testid="text-stop-removed">
                          {plan.remove.map(r => formatPreviewDate(r.dateIso)).join(', ')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Nothing will be removed.</p>
                    )}

                    {plan.keep.length > 0 && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <span className="font-medium">
                            {plan.keep.length === 1 ? 'This session will be kept:' : `These ${plan.keep.length} sessions will be kept:`}
                          </span>
                          <span className="block mt-1" data-testid="text-stop-kept">
                            {plan.keep.map(k => (
                              `${formatPreviewDate(k.dateIso)} — ${
                                k.reason === 'is_origin' ? 'the session you created'
                                : k.reason === 'has_bookings' ? `${k.bookingCount} booking${k.bookingCount === 1 ? '' : 's'}`
                                : 'already started'}`
                            )).join(', ')}
                          </span>
                          <span className="block mt-1 text-xs">
                            Stopping ends the repeat only. Sessions players have booked stay, and so does the one you
                            created — cancel those individually if you need to.
                          </span>
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={stopMutation.isPending}>Keep it running</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (target) stopMutation.mutate(target.id); }}
              disabled={stopMutation.isPending || planLoading}
              data-testid="button-confirm-stop-series"
            >
              {stopMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Stopping...</>
              ) : 'Stop series'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!extendTarget} onOpenChange={(open) => { if (!open) { setExtendTarget(null); setExtendError(null); } }}>
        <AlertDialogContent data-testid="dialog-extend-series">
          <AlertDialogHeader>
            <AlertDialogTitle>Add more {extendTarget?.weekday}s</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Adds {weeks} session{weeks === 1 ? '' : 's'} to this series. Nothing existing changes.</p>

                <div className="flex flex-wrap gap-2" role="group" aria-label="How many weeks to add">
                  {WEEK_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={weeks === n}
                      onClick={() => setWeeks(n)}
                      className={`h-11 min-w-11 rounded-md border px-3 text-sm font-medium transition-colors ${
                        weeks === n
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-muted'
                      }`}
                      data-testid={`chip-extend-weeks-${n}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <p className="text-muted-foreground" data-testid={`text-extend-preview-${extendTarget?.id}`}>
                  Creates: {previewDates.map(formatPreviewDate).join(', ')}
                </p>

                {extendError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription data-testid="text-extend-error">{extendError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={extendMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (extendTarget) extendMutation.mutate({ id: extendTarget.id, weeks }); }}
              disabled={extendMutation.isPending || !!extendError}
              data-testid="button-confirm-extend-series"
            >
              {extendMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</>
              ) : `Add ${weeks} session${weeks === 1 ? '' : 's'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
