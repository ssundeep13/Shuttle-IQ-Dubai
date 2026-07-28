// Founding Member award screen — full-screen, shown once.
//
// Gating is server-side: /auth/me returns foundingMember with seenAt, and this
// renders only while seenAt is null. Dismiss POSTs the seen endpoint (which
// stamps seen_at only when it is still NULL), then refreshes the user so the
// screen cannot reappear — not on the next app open, and not if the award is
// revoked before the seal and later re-earned.
//
// Brand: flat #003E8C, Inter only, no emoji, no gradients beyond the medal
// artwork itself.
import { useState } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

const FF = "'Inter', system-ui, sans-serif";
const NAVY = '#003E8C';
const TEAL = '#2BB3A3';

export default function FoundingMemberAward() {
  const { user } = useMarketplaceAuth();
  const [dismissing, setDismissing] = useState(false);
  const award = user?.foundingMember;

  // Server-gated: no award, or already dismissed → nothing to show.
  if (!award || award.seenAt) return null;

  const dismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      await apiRequest('POST', '/api/marketplace/badges/founding-member/seen');
    } catch {
      // A failed stamp must not trap the player behind a full-screen overlay;
      // the refresh below still runs and the screen re-shows next open at worst.
    }
    // Same refetch the auth context uses everywhere else — seenAt comes back
    // stamped and this component unmounts itself.
    try { await queryClient.refetchQueries({ queryKey: ['/api/marketplace/auth/me'] }); } catch { /* non-fatal */ }
    setDismissing(false);
  };

  const share = async () => {
    const text = 'I was there first. Founding Member — Silicon Oasis, July 2026. ShuttleIQ.';
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://shuttleiq.ai';
    // Web Share Level 2 (files) first so the medal itself travels with the post
    // where the platform supports it; falls back to the text+url sheet this app
    // already uses elsewhere, then to the clipboard.
    try {
      const res = await fetch('/badges/founding-member-medal.png');
      const blob = await res.blob();
      const file = new File([blob], 'shuttleiq-founding-member.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'Founding Member' });
        return;
      }
    } catch { /* fall through to the text sheet */ }
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Founding Member', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
    } catch { /* user cancelled or clipboard unavailable */ }
  };

  return (
    <div
      data-testid="screen-founding-member-award"
      role="dialog"
      aria-modal="true"
      aria-label="Founding Member"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: NAVY,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', textAlign: 'center', overflowY: 'auto',
      }}
    >
      <div style={{ fontFamily: FF, fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em', color: '#fff', marginBottom: 'auto' }}>
        Shuttle<span style={{ color: TEAL }}>IQ</span>
      </div>

      <img
        src="/badges/founding-member-medal.png"
        alt="Founding Member medal"
        data-testid="img-founding-member-medal"
        style={{ width: 'min(260px, 62vw)', height: 'auto', margin: '24px 0' }}
      />

      <div
        data-testid="text-founding-member-title"
        style={{ fontFamily: FF, fontWeight: 800, fontSize: 22, letterSpacing: '0.14em', color: '#fff' }}
      >
        FOUNDING MEMBER
      </div>
      <div
        data-testid="text-founding-member-subtitle"
        style={{ fontFamily: FF, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', color: TEAL, marginTop: 8 }}
      >
        SILICON OASIS &middot; JULY 2026
      </div>

      <p style={{ fontFamily: FF, fontWeight: 400, fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', margin: '20px 0 0', maxWidth: 320 }}>
        You were here first. Awarded once. Never again.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 32, marginBottom: 'auto', width: '100%', maxWidth: 320 }}>
        <button
          type="button"
          onClick={share}
          data-testid="button-founding-member-share"
          style={{
            flex: 1, minHeight: 48, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: TEAL, color: '#00272E',
            fontFamily: FF, fontWeight: 700, fontSize: 15,
          }}
        >
          Share
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={dismissing}
          data-testid="button-founding-member-done"
          style={{
            flex: 1, minHeight: 48, borderRadius: 6, cursor: dismissing ? 'default' : 'pointer',
            background: 'transparent', color: '#fff',
            border: '1px solid rgba(255,255,255,0.35)',
            fontFamily: FF, fontWeight: 700, fontSize: 15,
            opacity: dismissing ? 0.6 : 1,
          }}
        >
          {dismissing ? 'Closing' : 'Done'}
        </button>
      </div>
    </div>
  );
}
