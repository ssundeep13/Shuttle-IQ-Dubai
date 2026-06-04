import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { apiUrl } from '@/lib/queryClient';
import { CheckCircle, Loader2, AlertCircle, ListOrdered, Wallet } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { motion, useReducedMotion } from 'framer-motion';
import { queryClient } from '@/lib/queryClient';
import type { BookingWithDetails } from '@shared/schema';
import { InstallAppBar } from '@/components/InstallAppBar';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { MKT, FF_DISPLAY, FF_BODY } from './LandingComponents';

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;
const REDIRECT_DELAY_S = 3;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function navyBtnStyle(): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em',
    padding: '12px 20px', borderRadius: 10, border: '1.5px solid transparent',
    background: MKT.navy, color: '#fff', borderColor: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}
function ghostBtnStyle(): CSSProperties {
  return {
    fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em',
    padding: '12px 20px', borderRadius: 10, border: `1.5px solid ${MKT.navy}55`,
    background: '#fff', color: MKT.navy, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
  };
}

function IconCircle({ tone, ring, children }: { tone: string; ring: string; children: ReactNode }) {
  return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', background: ring, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
      <div style={{ color: tone, display: 'flex' }}>{children}</div>
    </div>
  );
}

export default function CheckoutSuccess() {
  usePageTitle('Booking Confirmed');
  const [status, setStatus] = useState<'verifying' | 'success' | 'waitlisted' | 'error'>('verifying');
  const [attempt, setAttempt] = useState(0);
  const [booking, setBooking] = useState<BookingWithDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_S);
  const [sessionLost, setSessionLost] = useState(false);
  const [, setLocation] = useLocation();
  const { loginWithTokens, isAuthenticated } = useMarketplaceAuth();
  const reduce = useReducedMotion();
  const isExtraGuest = new URLSearchParams(window.location.search).get('extra_guest') === '1';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get('booking_id');
    const resumeToken = params.get('resume');

    if (!bookingId) {
      setStatus('error');
      setErrorMessage('Missing booking information');
      return;
    }

    // Poll the confirm endpoint up to MAX_ATTEMPTS times with a delay between each.
    // Ziina sometimes redirects before it finishes updating the payment status on
    // their side, so we give them a few seconds to settle before giving up.
    // The confirm endpoint does not require auth — the UUID booking ID is sufficient.
    let cancelled = false;

    // If Ziina handed us a resume token AND we don't already have a session in
    // this browser context (e.g. PWA -> system browser redirect lost the
    // original tab's localStorage), exchange it for fresh JWTs so the user
    // stays signed in for "View My Bookings" and the rest of the marketplace.
    async function maybeResumeSession() {
      if (!resumeToken) return;
      const haveLocal = !!(localStorage.getItem('mp_accessToken') ?? sessionStorage.getItem('mp_accessToken'));
      if (haveLocal || isAuthenticated) {
        // Already signed in — strip the param so it isn't shareable/replayable.
        const cleanUrl = `${window.location.pathname}?booking_id=${bookingId}${isExtraGuest ? '&extra_guest=1' : ''}`;
        try { window.history.replaceState({}, '', cleanUrl); } catch {}
        return;
      }
      try {
        const res = await fetch(apiUrl('/api/marketplace/auth/resume'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume: resumeToken }),
        });
        if (res.ok) {
          const data = await res.json();
          await loginWithTokens(data.accessToken, data.refreshToken, true);
        } else {
          setSessionLost(true);
        }
      } catch {
        // Non-fatal — confirm-poll below still works without auth.
        setSessionLost(true);
      } finally {
        // Always strip the resume param so it can't be replayed from history.
        const cleanUrl = `${window.location.pathname}?booking_id=${bookingId}${isExtraGuest ? '&extra_guest=1' : ''}`;
        try { window.history.replaceState({}, '', cleanUrl); } catch {}
      }
    }

    async function pollConfirm() {
      const token = localStorage.getItem('mp_accessToken') ?? sessionStorage.getItem('mp_accessToken');
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        if (i > 0) {
          setAttempt(i);
          await sleep(RETRY_DELAY_MS);
        }
        if (cancelled) return;

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(apiUrl(`/api/marketplace/bookings/${bookingId}/confirm`), {
            method: 'POST',
            headers,
          });
          const data = await res.json();

          if (data.confirmed) {
            setStatus('success');
            setBooking(data.booking);
            // Invalidate the session players list and session data so the
            // "Who's Playing" section updates for anyone viewing that session.
            if (data.booking?.sessionId) {
              const sid = data.booking.sessionId;
              queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', sid, 'players'] });
              queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', sid] });
            }
            queryClient.invalidateQueries({ queryKey: ['/api/marketplace/bookings/mine'] });
            return;
          }

          // Session became full right as this user paid — they're now waitlisted
          if (data.waitlisted) {
            setStatus('waitlisted');
            setBooking(data.booking);
            return;
          }

          // If it's the last attempt, surface the error
          if (i === MAX_ATTEMPTS - 1) {
            setStatus('error');
            setErrorMessage(
              data.status
                ? `Payment status: ${data.status}. Please contact support if you were charged.`
                : 'Payment not confirmed. Please contact support.'
            );
          }
          // Otherwise loop around and retry
        } catch {
          if (i === MAX_ATTEMPTS - 1) {
            setStatus('error');
            setErrorMessage('Failed to verify payment. Please check My Bookings or contact support.');
          }
        }
      }
    }

    (async () => {
      await maybeResumeSession();
      if (!cancelled) await pollConfirm();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSignInNotice = status === 'success' && sessionLost && !isAuthenticated;

  // Auto-redirect to My Bookings after success — but not if the user has no
  // session (they'd just bounce to the login screen).
  useEffect(() => {
    if (status !== 'success') return;
    if (showSignInNotice) return;
    let count = REDIRECT_DELAY_S;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        setLocation('/marketplace/my-bookings');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [status, setLocation, showSignInNotice]);

  const verifyingLabel = attempt > 0
    ? `Checking with payment provider… (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`
    : 'Verifying your payment… This may take up to 30 seconds';

  // Gentle on-mount / on-state-change entrance for the header — restrained, no confetti.
  const headerMotion = reduce
    ? {}
    : { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] as const } };
  const bodyMotion = reduce
    ? {}
    : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] as const, delay: 0.08 } };

  return (
    <>
    <div style={{ minHeight: '100vh', background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY }} className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${MKT.navy}14`, overflow: 'hidden' }}>
          {/* Header */}
          <motion.div key={status} {...headerMotion} className="text-center" style={{ padding: '36px 28px 8px' }}>
            {status === 'verifying' && (
              <>
                <IconCircle tone={MKT.navy} ring={`${MKT.navy}0F`}>
                  <Loader2 className="h-9 w-9 animate-spin" />
                </IconCircle>
                <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 22, color: MKT.navy, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{verifyingLabel}</h1>
              </>
            )}
            {status === 'success' && (
              <>
                <IconCircle tone={MKT.green} ring="#DDEEE2">
                  <CheckCircle className="h-10 w-10" />
                </IconCircle>
                <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 30, color: MKT.navy, letterSpacing: '-0.025em' }} data-testid="text-booking-confirmed">
                  {isExtraGuest ? 'Guest Added!' : 'Booking Confirmed!'}
                </h1>
              </>
            )}
            {status === 'waitlisted' && (
              <>
                <IconCircle tone={MKT.amber} ring="#F6E6CC">
                  <ListOrdered className="h-9 w-9" />
                </IconCircle>
                <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 26, color: MKT.navy, letterSpacing: '-0.02em' }} data-testid="text-waitlisted-title">Added to Waitlist</h1>
              </>
            )}
            {status === 'error' && (
              <>
                <IconCircle tone={MKT.red} ring="#F1D7D2">
                  <AlertCircle className="h-9 w-9" />
                </IconCircle>
                <h1 style={{ margin: 0, fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 26, color: MKT.navy, letterSpacing: '-0.02em' }} data-testid="text-error-title">Something went wrong</h1>
              </>
            )}
          </motion.div>

          {/* Body */}
          <motion.div {...bodyMotion} className="text-center space-y-4" style={{ padding: '8px 28px 32px' }}>
            {status === 'success' && booking && (
              <>
                <p style={{ color: MKT.inkSub, lineHeight: 1.55 }} data-testid="text-success-message">
                  {isExtraGuest
                    ? <>The extra spot has been confirmed for <span style={{ fontWeight: 600, color: MKT.ink }}>{booking.session?.title}</span>.</>
                    : <>Your spot for <span style={{ fontWeight: 600, color: MKT.ink }}>{booking.session?.title}</span> has been reserved.</>
                  }
                </p>
                {booking.walletAmountUsed > 0 ? (
                  <div className="space-y-1 text-sm" style={{ color: MKT.inkSub }}>
                    {booking.paymentMethod === 'wallet' ? (
                      <p className="flex items-center justify-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" style={{ color: MKT.teal }} />
                        Paid with wallet credit: AED {(booking.walletAmountUsed / 100).toFixed(2)}
                      </p>
                    ) : (
                      <>
                        <p>Total: AED {booking.amountAed}</p>
                        <p style={{ color: MKT.tealD }}>Wallet credit: AED {(booking.walletAmountUsed / 100).toFixed(2)}</p>
                        <p>Card payment: AED {(booking.amountAed - booking.walletAmountUsed / 100).toFixed(2)}</p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: MKT.inkSub }}>
                    Amount paid: AED {booking.amountAed}
                  </p>
                )}
              </>
            )}
            {status === 'success' && !booking && (
              <p style={{ color: MKT.inkSub, lineHeight: 1.55 }} data-testid="text-success-message">
                {isExtraGuest
                  ? 'The extra spot has been confirmed.'
                  : 'Your payment is confirmed. Your booking has been reserved.'}
              </p>
            )}
            {status === 'waitlisted' && (
              <p style={{ color: MKT.inkSub, lineHeight: 1.55 }} data-testid="text-waitlisted-message">
                Your payment went through, but the session filled up just as you completed it. You have been added to the waitlist and will be confirmed if a spot opens up.
              </p>
            )}
            {status === 'error' && (
              <p style={{ color: MKT.inkSub, lineHeight: 1.55 }} data-testid="text-error-message">{errorMessage}</p>
            )}
            {status === 'success' && !showSignInNotice && (
              <p className="text-sm" style={{ color: MKT.inkMute }}>
                Redirecting to your bookings in {countdown}s…
              </p>
            )}
            {showSignInNotice && (
              <div
                className="rounded-md p-3 text-sm text-left"
                style={{ background: MKT.cream, border: `1px solid ${MKT.navy}12`, color: MKT.inkSub }}
                data-testid="notice-signin-required"
              >
                Your booking is confirmed. Please sign in again to view your bookings.
              </div>
            )}
            {status !== 'verifying' && (
              <div className="flex gap-3 justify-center flex-wrap pt-2">
                {showSignInNotice ? (
                  <Link href={`/marketplace/login?from=${encodeURIComponent('/marketplace/my-bookings')}`}>
                    <button type="button" style={navyBtnStyle()} data-testid="button-signin-required">Sign In</button>
                  </Link>
                ) : (
                  <Link href="/marketplace/my-bookings">
                    <button type="button" style={navyBtnStyle()} data-testid="button-view-bookings">View My Bookings</button>
                  </Link>
                )}
                <Link href="/marketplace/book">
                  <button type="button" style={ghostBtnStyle()} data-testid="button-browse-sessions">Browse Sessions</button>
                </Link>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
    <InstallAppBar />
    </>
  );
}
