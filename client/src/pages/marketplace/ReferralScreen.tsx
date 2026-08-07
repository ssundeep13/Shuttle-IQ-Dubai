// Gate F3.6 — /marketplace/referrals. The dashboard's full "My Referrals"
// block relocated wholesale (wallet, code copy, share, reward ladder,
// referred list — all testids and behavior intact), plus the apply-a-code
// form for eligible users. The dashboard keeps a one-card teaser reading the
// same query keys, so both screens share a cache.
import { useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Check, Copy, Gift } from 'lucide-react';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { apiRequest } from '@/lib/queryClient';
import { shareUrl } from '@/lib/shareLinks';
import { MKT, FF_DISPLAY, FF_BODY, FF_MONO, Reveal } from './LandingComponents';

const cardStyle: CSSProperties = { background: '#fff', borderRadius: 14, border: `1px solid ${MKT.navy}12`, padding: '20px 22px' };

interface ReferralData {
  referralCode: string;
  walletBalance: number;
  completedCount: number;
  ambassadorStatus: boolean;
  leaderboardMention: boolean;
  jerseyDispatched: boolean;
  referrals: Array<{
    id: string;
    refereeName: string | null;
    status: string;
  }>;
}

interface ReferralStatus {
  hasIncomingReferral: boolean;
  referrerName: string | null;
  eligibleUntil: string;
  dismissedAt: string | null;
}

export default function ReferralScreen() {
  usePageTitle('Referrals');
  const [, navigate] = useLocation();
  const { user } = useMarketplaceAuth();
  const linkedPlayerId = user?.linkedPlayerId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [applyCode, setApplyCode] = useState('');

  const { data: referralData } = useQuery<ReferralData>({
    queryKey: ['/api/referrals/player', linkedPlayerId],
    enabled: !!linkedPlayerId,
  });
  const { data: referralStatus } = useQuery<ReferralStatus>({
    queryKey: ['/api/marketplace/me/referral-status'],
    enabled: !!user,
  });

  const applyReferralMutation = useMutation({
    mutationFn: (code: string) => apiRequest('POST', '/api/referrals/link', { referralCode: code.trim() }),
    onSuccess: () => {
      toast({ title: 'Referral code added!', description: "You and your friend each get AED 15 after your first game." });
      setApplyCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/me/referral-status'] });
    },
    onError: (err: { error?: string }) => {
      toast({ title: 'Could not add code', description: err?.error ?? 'Please check the code and try again.', variant: 'destructive' });
    },
  });

  // Same eligibility as the dashboard nudge, minus the dismissal — dismissing
  // the prompt never removes the capability.
  const canApplyCode =
    !!referralStatus &&
    !referralStatus.hasIncomingReferral &&
    new Date(referralStatus.eligibleUntil).getTime() > Date.now();

  return (
    <div style={{ background: MKT.cream, color: MKT.ink, fontFamily: FF_BODY, minHeight: '100%' }}>
      <div className="max-w-3xl mx-auto" style={{ padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px) clamp(48px, 6vw, 64px)' }}>
        <Reveal>
          <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginBottom: 18 }}>
            <Link
              href="/marketplace/dashboard"
              data-testid="button-back"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: MKT.inkSub, fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </div>
        </Reveal>

        <Reveal>
          <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
            <Gift className="h-5 w-5" style={{ color: MKT.teal }} />
            <h2 style={{ margin: 0, fontFamily: FF_BODY, fontWeight: 800, fontSize: 20, color: MKT.navy, letterSpacing: '-0.02em' }}>My Referrals</h2>
          </div>
        </Reveal>

        {referralData && linkedPlayerId ? (
          <Reveal>
            <div style={cardStyle} data-testid="card-my-referrals">
              <div className="space-y-4">
                {/* Wallet balance + friends played */}
                <div className="flex items-end gap-4" style={{ padding: 14, borderRadius: 12, background: MKT.cream }}>
                  {/* Wallet figure taps through to the history view — same
                      pattern as the Profile card (press state + keyboard).
                      The "Friends played" half of the strip stays static. */}
                  <div
                    className="flex-1 min-w-0 transition-transform active:scale-[0.99]"
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    aria-label="View wallet history"
                    data-testid="button-referrals-wallet"
                    onClick={() => navigate('/marketplace/wallet')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/marketplace/wallet'); } }}
                  >
                    <p style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Wallet balance</p>
                    <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 30, color: MKT.navy, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 4 }} data-testid="text-wallet-balance">
                      AED {(referralData.walletBalance / 100).toFixed(2)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Friends played</p>
                    <p style={{ fontFamily: FF_DISPLAY, fontWeight: 700, fontSize: 30, color: MKT.teal, letterSpacing: '-0.025em', lineHeight: 1, marginTop: 4 }}>{referralData.completedCount}</p>
                  </div>
                </div>

                {/* Code + copy */}
                <div className="flex items-center justify-between gap-2" style={{ padding: '12px 14px', borderRadius: 10, background: MKT.cream, border: `1px dashed ${MKT.navy}33` }}>
                  <div className="min-w-0">
                    <p style={{ fontFamily: FF_MONO, fontSize: 9, fontWeight: 700, color: MKT.inkSub, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Your code</p>
                    <p style={{ fontFamily: FF_MONO, fontWeight: 700, fontSize: 16, color: MKT.navy, letterSpacing: '0.02em', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="text-referral-code">{referralData.referralCode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(referralData.referralCode);
                      toast({ title: 'Copied!', description: 'Referral code copied to clipboard' });
                    }}
                    data-testid="button-copy-referral"
                    aria-label="Copy referral code"
                    style={{ flex: 'none', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${MKT.navy}33`, background: '#fff', color: MKT.navy, cursor: 'pointer', fontFamily: FF_BODY, fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                </div>

                {/* Share Your Code — real signup ?ref= link */}
                <button
                  type="button"
                  onClick={() => {
                    const url = shareUrl(`/marketplace/signup?ref=${encodeURIComponent(referralData.referralCode)}`);
                    const nav = navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
                    if (typeof nav.share === 'function') {
                      nav.share({ title: 'Join me on ShuttleIQ', text: 'Book badminton sessions in Dubai with me on ShuttleIQ.', url }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(url);
                      toast({ title: 'Link copied!', description: 'Your referral link is on the clipboard' });
                    }
                  }}
                  data-testid="button-share-referral"
                  style={{ fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, padding: '11px 18px', borderRadius: 10, border: `1.5px solid ${MKT.navy}`, background: MKT.navy, color: '#fff', cursor: 'pointer', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  Share Your Code <ArrowRight className="h-4 w-4" />
                </button>

                {/* Next-reward progress (until Ambassador) */}
                {!referralData.ambassadorStatus && (
                  <div>
                    <div className="flex items-center justify-between" style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                      <span style={{ color: MKT.inkSub }}>
                        {referralData.completedCount < 5
                          ? `Next reward · ${5 - referralData.completedCount} more`
                          : `Next reward · ${10 - referralData.completedCount} more`}
                      </span>
                      <span style={{ color: MKT.tealD }}>
                        {referralData.completedCount}/{referralData.completedCount < 5 ? 5 : 10}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,30,70,0.08)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%', borderRadius: 999, background: MKT.teal, transition: 'width 0.5s cubic-bezier(.2,.7,.2,1)',
                          width: `${Math.min(100, (referralData.completedCount / (referralData.completedCount < 5 ? 5 : 10)) * 100)}%`,
                        }}
                        data-testid="progress-referral-milestone"
                      />
                    </div>
                  </div>
                )}

                {/* Reward ladder — both rungs */}
                <div className="space-y-2">
                  {[
                    { at: 5, label: 'Featured on the leaderboard' },
                    { at: 10, label: 'Ambassador status + ShuttleIQ jersey' },
                  ].map((m) => {
                    const reached = referralData.completedCount >= m.at;
                    return (
                      <div key={m.at} className="flex items-center gap-2" style={{ fontSize: 13, color: reached ? MKT.ink : MKT.inkSub }}>
                        {reached ? (
                          <Check className="h-4 w-4 shrink-0" style={{ color: MKT.green }} />
                        ) : (
                          <span style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${MKT.line}`, background: '#fff', flex: 'none' }} />
                        )}
                        <span><b style={{ color: MKT.navy, fontWeight: 600 }}>{m.at}</b> referrals — {m.label}</span>
                      </div>
                    );
                  })}
                </div>

                {(referralData.leaderboardMention || referralData.ambassadorStatus || referralData.jerseyDispatched) && (
                  <div className="flex flex-wrap gap-1.5">
                    {referralData.leaderboardMention && (
                      <span style={{ background: MKT.teal, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} data-testid="badge-leaderboard-mention">
                        Leaderboard Member
                      </span>
                    )}
                    {referralData.ambassadorStatus && (
                      <span style={{ background: MKT.navy, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} data-testid="badge-ambassador">
                        Ambassador
                      </span>
                    )}
                    {referralData.jerseyDispatched && (
                      <span style={{ background: MKT.tealMist, color: MKT.tealD, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }} data-testid="badge-jersey">
                        Jersey Dispatched
                      </span>
                    )}
                  </div>
                )}

                {referralData.referrals.length > 0 && (
                  <div className="space-y-2">
                    <p style={{ fontSize: 11, color: MKT.inkSub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Referred Players</p>
                    {referralData.referrals.map((ref) => (
                      <div key={ref.id} className="flex items-center justify-between gap-2" style={{ padding: '6px 0', borderBottom: `1px solid ${MKT.line}` }} data-testid={`row-referral-${ref.id}`}>
                        <span style={{ fontSize: 14, color: MKT.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.refereeName || 'Pending link'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {ref.status === 'completed' && (
                            <span style={{ fontSize: 12, color: MKT.inkSub }}>AED 15</span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: ref.status === 'completed' ? MKT.navy : 'rgba(0,30,70,0.08)', color: ref.status === 'completed' ? '#fff' : MKT.inkSub }}>
                            {/* clawed_back deliberately reads Pending: since revival
                                shipped, the friend's next paid booking completes it —
                                behaviorally identical to pending for the player. */}
                            {ref.status === 'completed' ? 'Completed' : ref.status === 'invalid' ? 'Not eligible' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        ) : (
          <Reveal>
            <div style={{ ...cardStyle, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, color: MKT.inkSub }}>Link your player profile to unlock referrals.</p>
              <Link href="/marketplace/profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, color: MKT.tealD, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
                Go to profile <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Reveal>
        )}

        {/* Apply a friend's code — same mutation and eligibility as the
            dashboard nudge; dismissing the nudge never removes the capability. */}
        {canApplyCode && (
          <Reveal>
            <div style={{ ...cardStyle, marginTop: 16 }} data-testid="card-apply-referral">
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: MKT.ink }}>Got a friend's code?</p>
              <p style={{ margin: 0, marginTop: 2, fontSize: 12, color: MKT.inkSub }}>
                Add it and you'll <span style={{ fontWeight: 600, color: MKT.ink }}>both get AED 15</span> after your first game.
              </p>
              <form
                className="flex items-center gap-2 flex-wrap"
                style={{ marginTop: 12 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (applyCode.trim() && !applyReferralMutation.isPending) {
                    applyReferralMutation.mutate(applyCode);
                  }
                }}
              >
                <input
                  type="text"
                  value={applyCode}
                  onChange={(e) => setApplyCode(e.target.value)}
                  placeholder="Enter code"
                  aria-label="Referral code"
                  data-testid="input-apply-referral-code"
                  style={{
                    fontFamily: FF_MONO, fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${MKT.navy}33`,
                    background: '#fff', color: MKT.ink, minWidth: 0, flex: '1 1 160px', maxWidth: 220,
                  }}
                />
                <button
                  type="submit"
                  disabled={!applyCode.trim() || applyReferralMutation.isPending}
                  data-testid="button-apply-referral-code"
                  style={{
                    fontFamily: FF_BODY, fontWeight: 600, fontSize: 13, padding: '8px 14px', borderRadius: 10,
                    border: `1.5px solid ${MKT.teal}`, background: MKT.teal, color: '#fff', cursor: 'pointer',
                    opacity: (!applyCode.trim() || applyReferralMutation.isPending) ? 0.6 : 1,
                  }}
                >
                  {applyReferralMutation.isPending ? 'Adding…' : 'Apply'}
                </button>
              </form>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
