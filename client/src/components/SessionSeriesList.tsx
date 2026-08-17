// Recurring series management. Lists every live weekly series and lets an
// admin stop one.
//
// Stopping is not a delete-all: sessions that already have bookings are kept,
// because removing them would strand real players (and the database would not
// stop us — almost nothing hangs off a session by foreign key). So the confirm
// dialog is built from a server-computed preview and states plainly what will
// go and what will stay, before anything happens.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Loader2, AlertCircle, Clock, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatPreviewDate } from "@shared/utils/seriesDates";

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
}
interface StopRow { opsId: string; bookableId: string | null; dateIso: string; bookingCount: number; reason?: string }
interface StopPlan { remove: StopRow[]; keep: (StopRow & { reason: string })[] }

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

export function SessionSeriesList() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<SeriesListItem | null>(null);

  const { data: series = [], isLoading } = useQuery<SeriesListItem[]>({
    queryKey: ['/api/sessions/series'],
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading repeating sessions...
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            No repeating sessions yet. Turn on "Repeat every week" when you create a session to start one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="list-session-series">
      {series.map((s) => (
        <Card key={s.id} data-testid={`card-series-${s.id}`}>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTarget(s)}
                data-testid={`button-stop-series-${s.id}`}
              >
                Stop series
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-testid={`text-series-count-${s.id}`}>{sessionCountLabel(s)}</Badge>
            {s.bookedSessions > 0 && (
              <Badge variant="outline">
                {s.bookedSessions} with bookings
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">started {formatPreviewDate(s.originDate)}</span>
          </CardContent>
        </Card>
      ))}

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
    </div>
  );
}
