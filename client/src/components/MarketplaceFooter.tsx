import { Link } from 'wouter';
import { SiWhatsapp } from 'react-icons/si';
import { Phone } from 'lucide-react';

const FF_MONO = `'JetBrains Mono', ui-monospace, Menlo, monospace`;
const CREAM = '#F5EFE0';

// Mono uppercase column header (amber), matching the Home footer.
function ColHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{ fontFamily: FF_MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#F6D89A' }}
      className="mb-3"
    >
      {children}
    </h4>
  );
}

const footerLinkClass = 'text-[#F5EFE0]/75 hover:text-[#F5EFE0] transition-colors';

export function MarketplaceFooter() {
  return (
    <footer style={{ background: '#002A60', color: CREAM }} className="mt-auto" data-testid="marketplace-footer">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-3">
              <span className="text-xl font-bold text-white" style={{ letterSpacing: '-0.03em' }}>
                Shuttle<span style={{ color: '#006B5F' }}>IQ</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,239,224,0.72)' }}>
              Smart queue management for badminton communities across Dubai.
              Play more, wait less.
            </p>
            <div className="flex gap-2 mt-4">
              <a
                href="https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join our WhatsApp community"
                data-testid="link-footer-social-whatsapp"
                className="inline-flex items-center justify-center rounded-full transition-colors"
                style={{ width: 34, height: 34, background: 'rgba(245,239,224,0.08)', color: CREAM }}
              >
                <SiWhatsapp className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Platform */}
          <div>
            <ColHeader>Platform</ColHeader>
            <ul className="space-y-2 text-sm">
              <li><Link href="/marketplace/book" className={footerLinkClass} data-testid="link-footer-sessions">Browse Sessions</Link></li>
              <li><Link href="/marketplace/rankings" className={footerLinkClass} data-testid="link-footer-rankings">Rankings</Link></li>
              <li><Link href="/marketplace/signup" className={footerLinkClass} data-testid="link-footer-signup">Create Account</Link></li>
              <li><Link href="/marketplace/blog" className={footerLinkClass} data-testid="link-footer-blog">Blog</Link></li>
              <li><Link href="/marketplace/join-the-crew" className={footerLinkClass} data-testid="link-footer-careers">Join our Tribe</Link></li>
            </ul>
          </div>

          {/* Players */}
          <div>
            <ColHeader>Players</ColHeader>
            <ul className="space-y-2 text-sm">
              <li><Link href="/marketplace/my-bookings" className={footerLinkClass} data-testid="link-footer-bookings">My Bookings</Link></li>
              <li><Link href="/marketplace/my-scores" className={footerLinkClass} data-testid="link-footer-scores">My Scores</Link></li>
              <li><Link href="/marketplace/scoring-guide" className={footerLinkClass} data-testid="link-footer-scoring-guide">Scoring Guide</Link></li>
              <li><Link href="/marketplace/profile" className={footerLinkClass} data-testid="link-footer-profile">Profile</Link></li>
            </ul>
          </div>

          {/* For Organizers */}
          <div>
            <ColHeader>For Organizers</ColHeader>
            <ul className="space-y-2 text-sm">
              <li><Link href="/admin/login" className={footerLinkClass} data-testid="link-footer-admin">Admin Login</Link></li>
            </ul>
          </div>

          {/* Contact Us */}
          <div>
            <ColHeader>Contact Us</ColHeader>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-2 ${footerLinkClass}`}
                  data-testid="link-footer-whatsapp-group"
                >
                  <SiWhatsapp className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#25D366' }} />
                  <span>Join our WhatsApp community for updates</span>
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/971525404127"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-2 ${footerLinkClass}`}
                  data-testid="link-footer-whatsapp-admin"
                >
                  <SiWhatsapp className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#25D366' }} />
                  <span>For any assistance contact the ShuttleIQ Admin</span>
                </a>
                <div className="flex items-center gap-1.5 mt-1.5 pl-6 text-xs" style={{ color: 'rgba(245,239,224,0.55)' }}>
                  <Phone className="h-3 w-3 shrink-0" />
                  <span data-testid="text-footer-phone">+971 52 540 4127</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-8 pt-6 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderTop: '1px solid rgba(245,239,224,0.12)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(245,239,224,0.55)' }}>
            &copy; {new Date().getFullYear()} ShuttleIQ. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: 'rgba(245,239,224,0.55)' }}>
            Built for the Dubai badminton community
          </p>
        </div>
      </div>
    </footer>
  );
}
