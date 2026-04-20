import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Calendar, Trophy, Users, Zap, MapPin, Star, ArrowRight, ChevronRight, Users2 } from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';
import { motion } from 'framer-motion';
import type { CommunitySpotlightEntry } from '@shared/schema';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { usePageTitle } from '@/hooks/usePageTitle';

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  _default: 'bg-muted text-muted-foreground border-border',
};

function tagCategoryClass(category: string): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR._default;
}

export default function MarketplaceHome() {
  usePageTitle('ShuttleIQ — Book Badminton Sessions in UAE', true);
  const { isAuthenticated } = useMarketplaceAuth();

  const { data: spotlight = [], isLoading: spotlightLoading } = useQuery<CommunitySpotlightEntry[]>({
    queryKey: ['/api/tags/community-spotlight'],
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex flex-col">
      <section className="relative py-20 md:py-32 px-4 bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(217,100%,22%)] via-primary to-[hsl(217,80%,30%)]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <motion.div
          className="relative max-w-4xl mx-auto text-center"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.p variants={fadeInUp} className="text-sm font-semibold uppercase tracking-wider text-primary-foreground/60 mb-4">
            Dubai's Badminton Community Platform
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            className="text-4xl md:text-6xl font-extrabold text-primary-foreground mb-5 leading-tight tracking-tight"
            data-testid="text-hero-title"
          >
            Play more.{' '}
            <span className="text-secondary">Wait less.</span>
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            className="text-lg md:text-xl text-primary-foreground/75 mb-10 max-w-2xl mx-auto leading-relaxed"
            data-testid="text-hero-subtitle"
          >
            Book badminton sessions, join the queue without the chaos, track your stats, and climb the leaderboard.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-3">
            <Link href="/marketplace/book">
              <Button size="lg" variant="secondary" className="gap-2 text-base" data-testid="button-browse-sessions">
                <Calendar className="h-5 w-5" />
                Browse Sessions
              </Button>
            </Link>
            {!isAuthenticated && (
              <Link href="/marketplace/signup">
                <Button size="lg" variant="outline" className="gap-2 text-base bg-transparent border-primary-foreground/30 text-primary-foreground" data-testid="button-join-now">
                  Join the Community
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </motion.div>
        </motion.div>
      </section>

      <section className="py-10 md:py-14 px-4 border-b">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
            {[
              { value: '500+', label: 'Games Played' },
              { value: '200+', label: 'Active Players' },
              { value: '10+', label: 'Venues Across Dubai' },
              { value: '4.9', label: 'Player Rating' },
            ].map((stat) => (
              <motion.div key={stat.label} variants={fadeInUp}>
                <div className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="py-10 md:py-14 px-4">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={fadeInUp}
        >
          <div className="relative rounded-md overflow-hidden bg-[#006B5F]">
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative flex flex-col sm:flex-row items-center gap-5 sm:gap-6 px-6 py-6 sm:px-8 sm:py-7">
              <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <SiWhatsapp className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg font-bold text-white mb-1" data-testid="text-whatsapp-banner-title">Join Our WhatsApp Community</h3>
                <p className="text-sm text-white/75 leading-relaxed">Stay on top of session updates, connect with players, and never miss a game.</p>
              </div>
              <Button
                asChild
                className="gap-2 bg-[#25D366] border-[#25D366] text-white shrink-0"
                data-testid="button-join-whatsapp"
              >
                <a
                  href="https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <SiWhatsapp className="h-4 w-4" />
                  Join Group
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp} className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" data-testid="text-how-it-works-title">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Get on the court in three simple steps</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Find a Session', desc: 'Browse upcoming sessions at top venues across Dubai. Filter by date, time, and skill level.' },
              { step: '2', title: 'Book Your Spot', desc: 'Reserve your place with instant online payment or pay at the venue. No queuing hassles.' },
              { step: '3', title: 'Play & Compete', desc: 'Show up, play fair matches with AI-balanced teams, and watch your ranking climb.' },
            ].map((item) => (
              <motion.div key={item.step} variants={fadeInUp} className="text-center">
                <div className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Community Personalities Section */}
      <section className="py-16 md:py-20 px-4 border-y bg-muted/30">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp} className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" data-testid="text-community-personalities-title">
              This Week's Community Personalities
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Real players, real recognition — tagged by their community</p>
          </motion.div>

          {spotlightLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : spotlight.length === 0 ? (
            <motion.div variants={fadeInUp} className="text-center py-8">
              <p className="text-muted-foreground text-sm">No community tags yet this week — be the first to recognise a great player!</p>
              {!isAuthenticated && (
                <Link href="/marketplace/signup">
                  <Button variant="outline" size="sm" className="mt-4 gap-1">
                    Join to tag players <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              )}
            </motion.div>
          ) : (
            <motion.div variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {spotlight.map((entry) => (
                <motion.div key={entry.tag.id} variants={fadeInUp}>
                  <Link href={`/marketplace/players/${entry.topPlayer.id}`}>
                    <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-spotlight-${entry.tag.id}`}>
                      <CardContent className="p-5">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border mb-3 ${tagCategoryClass(entry.tag.category)}`}>
                          {entry.tag.emoji} {entry.tag.label}
                          <span className="opacity-60 ml-0.5 text-xs">{entry.count}×</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          {entry.topPlayer.photoUrl ? (
                            <img
                              src={entry.topPlayer.photoUrl}
                              alt={entry.topPlayer.name}
                              className="w-9 h-9 rounded-full object-cover shrink-0"
                              data-testid={`img-spotlight-${entry.tag.id}`}
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                              {entry.topPlayer.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{entry.topPlayer.name}</p>
                            <p className="text-xs text-muted-foreground">{getTierDisplayName(entry.topPlayer.level)} · {entry.topPlayer.skillScore} pts</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Most tagged this week</p>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}

          {!isAuthenticated && spotlight.length > 0 && (
            <motion.div variants={fadeInUp} className="text-center mt-8">
              <Link href="/marketplace/signup">
                <Button variant="outline" className="gap-2" data-testid="button-join-to-tag">
                  Join to recognise your fellow players
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          )}
        </motion.div>
      </section>

      <section className="py-16 md:py-20 px-4 bg-card/50">
        <motion.div
          className="max-w-5xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp} className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3" data-testid="text-features-title">Why ShuttleIQ?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Everything you need to elevate your badminton game</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Calendar, title: 'Easy Booking', desc: 'Browse upcoming sessions across Dubai venues and book your spot in seconds.' },
              { icon: Trophy, title: 'Live Rankings', desc: 'Track your ELO-style skill rating and climb the ShuttleIQ leaderboard.' },
              { icon: Users, title: 'Community', desc: 'Connect with players of all levels, from beginners to professionals.' },
              { icon: Zap, title: 'Smart Matchmaking', desc: 'AI-powered team balancing ensures fair and competitive games every session.' },
              { icon: MapPin, title: 'Multiple Venues', desc: 'Play at top badminton facilities across Dubai with flexible scheduling.' },
              { icon: Star, title: 'Player Profiles', desc: 'Detailed stats, game history, and performance trends in your personal dashboard.' },
            ].map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <Card className="h-full hover-elevate" data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s/g, '-')}`}>
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-5 w-5 text-secondary" />
                    </div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-3xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
        >
          <motion.h2 variants={fadeInUp} className="text-2xl md:text-3xl font-bold mb-4">
            Ready to get on the court?
          </motion.h2>
          <motion.p variants={fadeInUp} className="text-muted-foreground mb-8 text-lg">
            Join hundreds of badminton players across Dubai. Book your first session today.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-3">
            <Link href="/marketplace/book">
              <Button size="lg" className="gap-2 text-base" data-testid="button-cta-book">
                View Upcoming Sessions
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            {!isAuthenticated && (
              <Link href="/marketplace/signup">
                <Button size="lg" variant="outline" className="gap-2 text-base" data-testid="button-cta-signup">
                  Create Free Account
                </Button>
              </Link>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* Hiring CTA Banner */}
      <section className="px-4 py-4 border-t bg-secondary/5">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center shrink-0">
                <Users2 className="h-4 w-4 text-secondary" />
              </div>
              <div>
                <p className="text-sm font-semibold">We're Hiring — Join the Crew</p>
                <p className="text-xs text-muted-foreground">Court Captain (Part-Time) · Dubai · AED 100/session</p>
              </div>
            </div>
            <Link href="/marketplace/join-the-crew">
              <Button size="sm" variant="secondary" className="gap-1.5 shrink-0" data-testid="button-hiring-banner">
                Learn More <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
