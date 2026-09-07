// Player Challenges (C4) — the "Challenge" call to action on a public profile.
//
// Driven entirely by GET /api/marketplace/challenges/status/:playerId: shown
// only when the server says the viewer may challenge; otherwise the reason
// ("Out of your range", "Challenge pending", "Challenge active") is the
// caption. Hidden on your own profile and for viewers without a linked
// player. Confirms before sending — a challenge notifies the other player.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { apiErrorText } from '@/lib/apiError';
import { navyBtn } from '@/pages/marketplace/LandingComponents';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StatusView {
  canChallenge: boolean;
  reason?: string;
  existing?: { id: string; status: string; direction: 'incoming' | 'outgoing' };
}

export function ChallengeButton({
  playerId,
  playerName,
  viewerPlayerId,
}: {
  playerId: string;
  playerName: string;
  viewerPlayerId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hidden = !viewerPlayerId || viewerPlayerId === playerId;

  const { data: status } = useQuery<StatusView>({
    queryKey: ['/api/marketplace/challenges/status', playerId],
    queryFn: () => apiRequest('GET', `/api/marketplace/challenges/status/${playerId}`),
    enabled: !hidden,
  });

  const send = useMutation({
    mutationFn: () => apiRequest('POST', '/api/marketplace/challenges', { challengedPlayerId: playerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/challenges'] });
      setOpen(false);
      setError(null);
      toast({ title: `Challenge sent to ${playerName}`, description: "You'll be notified when they respond." });
    },
    onError: (err) => setError(apiErrorText(err)),
  });

  if (hidden || !status) return null;

  const btn = navyBtn('sm');
  return (
    <div data-testid="challenge-cta" className="w-full min-[400px]:w-auto">
      {status.canChallenge ? (
        <button
          type="button"
          onClick={() => { setError(null); setOpen(true); }}
          className={`${btn.className} w-full min-[400px]:w-auto`}
          style={btn.style}
          data-testid="button-challenge"
        >
          Challenge
        </button>
      ) : status.reason ? (
        <p className="text-xs text-muted-foreground" data-testid="text-challenge-reason">{status.reason}</p>
      ) : null}

      <AlertDialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setError(null); } }}>
        <AlertDialogContent data-testid="dialog-challenge-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Challenge {playerName}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {playerName} will be asked to accept. Once accepted, the challenge settles by itself the next time
                  you play on opposite sides — the captain's score decides it.
                </p>
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription data-testid="text-challenge-error">{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={send.isPending}>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); send.mutate(); }}
              disabled={send.isPending || !!error}
              data-testid="button-confirm-challenge"
            >
              {send.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>) : 'Send challenge'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
