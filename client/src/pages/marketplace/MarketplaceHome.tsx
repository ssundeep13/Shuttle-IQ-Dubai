import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Calendar, Trophy, Users, Zap, MapPin, Star } from 'lucide-react';

export default function MarketplaceHome() {
  const { isAuthenticated } = useMarketplaceAuth();

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <section className="relative py-16 md:py-24 px-4 bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-4" data-testid="text-hero-title">
            Play. Compete. Improve.
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
            Book badminton sessions, track your rankings, and connect with the Dubai badminton community.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/marketplace/book">
              <Button size="lg" variant="secondary" className="gap-2" data-testid="button-browse-sessions">
                <Calendar className="h-5 w-5" />
                Browse Sessions
              </Button>
            </Link>
            {!isAuthenticated && (
              <Link href="/marketplace/signup">
                <Button size="lg" variant="outline" className="gap-2 bg-transparent border-primary-foreground/30 text-primary-foreground" data-testid="button-join-now">
                  Join Now
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8" data-testid="text-features-title">Why ShuttleIQ?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Calendar, title: 'Easy Booking', desc: 'Browse upcoming sessions across Dubai venues and book your spot in seconds.' },
              { icon: Trophy, title: 'Live Rankings', desc: 'Track your ELO-style skill rating and climb the ShuttleIQ leaderboard.' },
              { icon: Users, title: 'Community', desc: 'Connect with players of all levels, from beginners to professionals.' },
              { icon: Zap, title: 'Smart Matchmaking', desc: 'AI-powered team balancing ensures fair and competitive games every session.' },
              { icon: MapPin, title: 'Multiple Venues', desc: 'Play at top badminton facilities across Dubai with flexible scheduling.' },
              { icon: Star, title: 'Player Profiles', desc: 'Detailed stats, game history, and performance trends in your personal dashboard.' },
            ].map((feature) => (
              <Card key={feature.title} className="hover-elevate" data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s/g, '-')}`}>
                <CardContent className="p-6">
                  <feature.icon className="h-8 w-8 text-secondary mb-3" />
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 px-4 bg-muted/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to get on the court?</h2>
          <p className="text-muted-foreground mb-6">
            Join hundreds of badminton players across Dubai. Book your first session today.
          </p>
          <Link href="/marketplace/book">
            <Button size="lg" className="gap-2" data-testid="button-cta-book">
              <Calendar className="h-5 w-5" />
              View Upcoming Sessions
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
