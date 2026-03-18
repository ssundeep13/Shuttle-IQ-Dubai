import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, AlertCircle, Loader2, Calendar, MapPin, Clock, UserX } from 'lucide-react';

interface GuestInfo {
  id: string;
  name: string;
  email: string | null;
  status: string;
}

interface SessionInfo {
  title: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export default function GuestCancel() {
  const [, setLocation] = useLocation();
  const params = useParams<{ token?: string }>();
  const token = params.token || new URLSearchParams(window.location.search).get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState<GuestInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [alreadyCancelled, setAlreadyCancelled] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid cancellation link');
      setLoading(false);
      return;
    }

    fetch(`/api/marketplace/guests/${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Invalid or expired cancellation link');
        }
        return res.json();
      })
      .then(data => {
        setGuest(data.guest);
        setSession(data.session);
        if (data.guest?.status === 'cancelled') {
          setAlreadyCancelled(true);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleCancel = async () => {
    if (!token) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/marketplace/guests/${encodeURIComponent(token)}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      if (data.alreadyCancelled) {
        setAlreadyCancelled(true);
      } else {
        setCancelled(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <Skeleton className="h-8 w-1/2 mb-6" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground" data-testid="text-guest-cancel-error">{error}</p>
            <Button onClick={() => setLocation('/marketplace')} data-testid="button-go-home">
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadyCancelled) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <CardTitle>Already Cancelled</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground" data-testid="text-already-cancelled">
              Your spot for this session has already been cancelled.
            </p>
            <Button onClick={() => setLocation('/marketplace')} data-testid="button-go-home">
              Browse Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
            <CardTitle data-testid="text-cancel-success">Spot Cancelled</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your spot for <span className="font-semibold text-foreground">{session?.title}</span> has been cancelled. We hope to see you at a future session!
            </p>
            <Button onClick={() => setLocation('/marketplace')} data-testid="button-browse-sessions">
              Browse Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <Card>
        <CardHeader className="text-center">
          <UserX className="h-12 w-12 mx-auto text-destructive mb-4" />
          <CardTitle data-testid="text-cancel-title">Cancel Your Spot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-muted-foreground">
            Hi <span className="font-semibold text-foreground">{guest?.name}</span>, are you sure you want to cancel your spot for the following session?
          </p>

          {session && (
            <div className="p-4 rounded-md bg-muted/50 space-y-2">
              <p className="font-semibold text-sm" data-testid="text-session-title">{session.title}</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{format(new Date(session.date), 'EEEE, MMMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{session.startTime} - {session.endTime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{session.venueName}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setLocation('/marketplace')}
              data-testid="button-keep-spot"
            >
              Keep My Spot
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              disabled={cancelling}
              onClick={handleCancel}
              data-testid="button-confirm-cancel"
            >
              {cancelling ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling...</>
              ) : (
                <><XCircle className="h-4 w-4" /> Cancel Spot</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Want to join future sessions?{' '}
        <a
          href={guest?.email ? `/marketplace/signup?email=${encodeURIComponent(guest.email)}` : '/marketplace/signup'}
          className="text-primary hover:underline"
        >
          Create a free account
        </a>
      </p>
    </div>
  );
}
