// Gate F3.6 — full community feed at /marketplace/feed. The dashboard shows
// a capped teaser; this screen owns unlimited cursor pagination. Same
// CommunityFeed component and query keys, so navigation lands on a warm cache.
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MKT, FF_BODY, Reveal } from './LandingComponents';
import CommunityFeed from './CommunityFeed';

export default function FeedScreen() {
  usePageTitle('Community');
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
          <CommunityFeed variant="full" />
        </Reveal>
      </div>
    </div>
  );
}
