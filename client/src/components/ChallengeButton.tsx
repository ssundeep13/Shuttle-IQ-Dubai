// Player Challenges (C4 → C4.1) — the "Challenge <firstName>" call to action,
// rendered inside the head-to-head panel on a public profile.
//
// Driven entirely by GET /api/marketplace/challenges/status/:playerId. When
// the server allows it: a full-width teal button. Otherwise the same slot
// shows a disabled, button-shaped state: pending / active outline in navy,
// out-of-range (or capped) in a quiet ink tint — the panel around it still
// renders. Hidden on your own profile and for viewers without a linked
// player. Confirms before sending — a challenge notifies the other player.
import { useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { apiErrorText } from '@/lib/apiError';
import { MKT, FF_BODY } from '@/pages/marketplace/LandingComponents';
import { firstName } from '@shared/utils/challengeViews';
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

/** MKT.ink at the given alpha (ink-10 = 0.1, ink-50 = 0.5) — derived from the token, no new literals. */
export function inkTint(alpha: number): string {
  const hex = MKT.ink.replace('#', '');
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

type ButtonState = 'pending' | 'active' | 'out-of-range' | 'capped' | 'unavailable';

function stateFor(reason: string | undefined): { state: ButtonState; label: string } {
  switch (reason) {
    case 'Challenge pending': return { state: 'pending', label: 'Challenge pending' };
    case 'Challenge active': return { state: 'active', label: 'Challenge active — settles on court' };
    case 'Out of your range': return { state: 'out-of-range', label: 'Out of your range' };
    default:
      if (reason && /open challenges/i.test(reason)) return { state: 'capped', label: reason };
      return { state: 'unavailable', label: reason ?? 'Challenge unavailable' };
  }
}

const baseStyle: CSSProperties = {
  fontFamily: FF_BODY,
  fontWeight: 700,
  fontSize: 15,
  lineHeight: 1.2,
  minHeight: 48,
  borderRadius: 6,
  width: '100%',
  padding: '0 16px',
  borderWidth: 0,
  borderStyle: 'solid',
  borderColor: 'transparent',
};

const styleFor = (state: ButtonState | 'ready'): CSSProperties => {
  if (state === 'ready') return { ...baseStyle, backgroundColor: MKT.tealText, color: '#fff' };
  if (state === 'pending' || state === 'active') {
    return { ...baseStyle, backgroundColor: '#fff', color: MKT.navy, borderWidth: 1, borderColor: MKT.navy };
  }
  return { ...baseStyle, backgroundColor: inkTint(0.1), color: MKT.inkSub, cursor: 'not-allowed' };
};

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

  const first = firstName(playerName) || playerName;
  const blocked = status.canChallenge ? null : stateFor(status.reason);
  return (
    <div data-testid="challenge-cta" className="w-full">
      {!blocked ? (
        <button
          type="button"
          onClick={() => { setError(null); setOpen(true); }}
          className="siq-press w-full"
          style={styleFor('ready')}
          data-testid="button-challenge"
        >
          Challenge {first}
        </button>
      ) : (
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full"
          style={styleFor(blocked.state)}
          data-state={blocked.state}
          data-testid="button-challenge-state"
        >
          {blocked.label}
        </button>
      )}

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
