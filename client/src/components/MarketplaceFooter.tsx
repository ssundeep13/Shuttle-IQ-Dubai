import { Link } from 'wouter';
import { SiWhatsapp } from 'react-icons/si';
import { Phone } from 'lucide-react';

export function MarketplaceFooter() {
  return (
    <footer className="border-t bg-card/50 mt-auto" data-testid="marketplace-footer">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8">
          <div className="sm:col-span-2 md:col-span-1">
            <Link href="/" className="inline-block mb-3">
              <span className="text-xl font-bold tracking-tight">
                Shuttle<span className="text-secondary">IQ</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Smart queue management for badminton communities across Dubai.
              Play more, wait less.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/marketplace/book" className="hover:text-foreground transition-colors" data-testid="link-footer-sessions">Browse Sessions</Link></li>
              <li><Link href="/marketplace/rankings" className="hover:text-foreground transition-colors" data-testid="link-footer-rankings">Rankings</Link></li>
              <li><Link href="/marketplace/signup" className="hover:text-foreground transition-colors" data-testid="link-footer-signup">Create Account</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Players</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/marketplace/my-bookings" className="hover:text-foreground transition-colors" data-testid="link-footer-bookings">My Bookings</Link></li>
              <li><Link href="/marketplace/my-scores" className="hover:text-foreground transition-colors" data-testid="link-footer-scores">My Scores</Link></li>
              <li><Link href="/marketplace/profile" className="hover:text-foreground transition-colors" data-testid="link-footer-profile">Profile</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">For Organizers</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/admin/login" className="hover:text-foreground transition-colors" data-testid="link-footer-admin">Admin Login</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-3">Contact Us</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 hover:text-foreground transition-colors"
                  data-testid="link-footer-whatsapp-group"
                >
                  <SiWhatsapp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span>Join our WhatsApp community for updates</span>
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/971525404127"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 hover:text-foreground transition-colors"
                  data-testid="link-footer-whatsapp-admin"
                >
                  <SiWhatsapp className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  <span>For any assistance contact the ShuttleIQ Admin</span>
                </a>
                <div className="flex items-center gap-1.5 mt-1.5 pl-6 text-xs text-muted-foreground/70">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span data-testid="text-footer-phone">+971 52 540 4127</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} ShuttleIQ. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Built for the Dubai badminton community
          </p>
        </div>
      </div>
    </footer>
  );
}
