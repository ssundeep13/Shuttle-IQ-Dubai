import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Users,
  Zap,
  Sparkles,
  ShieldCheck,
  Gift,
  ArrowRight,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';

const SIGNUP_HREF = '/marketplace/signup?promo=jersey15';

const ADVANTAGES = [
  {
    icon: Zap,
    title: 'Smart matchmaking',
    body: 'Teams are balanced from live skill scores so every game is competitive — no more lopsided courts.',
  },
  {
    icon: Users,
    title: 'Fair, transparent queue',
    body: 'Everyone sees the queue. Rotations happen automatically. No favourites, no awkward waits.',
  },
  {
    icon: Trophy,
    title: 'Real rankings, not vibes',
    body: 'An ELO-style score updates after every match. Climb the leaderboard, prove your level.',
  },
  {
    icon: Sparkles,
    title: 'Community personalities',
    body: 'Earn tags from the people you play with — Smasher, Wall, Hustler. Reputation, gamified.',
  },
  {
    icon: ShieldCheck,
    title: 'No WhatsApp chaos',
    body: 'Book your slot, pay online, get reminders. Stop chasing organisers in 200-message group chats.',
  },
];

export default function Welcome() {
  usePageTitle('Upgrade Your Badminton Group');

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#003D3A] via-[#005049] to-[#006B5F] px-5 pt-12 pb-14 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,191,165,0.25),transparent_60%)]" />
        <div className="relative mx-auto max-w-2xl text-center">
          <Badge
            className="mb-4 border-[#00BFA5]/40 bg-[#00BFA5]/15 text-[#00BFA5] hover:bg-[#00BFA5]/15"
            data-testid="badge-jersey-offer"
          >
            <Gift className="mr-1 h-3 w-3" />
            AED 15 free credit on signup
          </Badge>
          <h1
            className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl"
            data-testid="text-hero-title"
          >
            Upgraded my game.
            <br />
            <span className="text-[#00BFA5]">Here&apos;s why.</span>
          </h1>
          <p
            className="mx-auto mt-4 max-w-md text-base text-white/80 sm:text-lg"
            data-testid="text-hero-subtitle"
          >
            ShuttleIQ runs the badminton community we always wished we had.
            Smart matchmaking, fair queues, real rankings — across the UAE.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3">
            <Link href={SIGNUP_HREF}>
              <Button
                size="lg"
                className="w-full max-w-xs bg-[#00BFA5] text-[#003D3A] hover:bg-[#00BFA5] border-[#00BFA5]"
                data-testid="button-hero-claim"
              >
                Claim AED 15 — Sign Up
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs text-white/60" data-testid="text-hero-footnote">
              Takes 30 seconds. Use it on your first booking.
            </p>
          </div>
        </div>
      </section>

      {/* Offer callout */}
      <section className="px-5 -mt-8">
        <div className="mx-auto max-w-2xl">
          <Card className="border-[#00BFA5]/30 bg-card shadow-md">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00BFA5]/15">
                  <Gift className="h-5 w-5 text-[#006B5F]" />
                </div>
                <div>
                  <p
                    className="text-sm font-semibold text-foreground"
                    data-testid="text-offer-title"
                  >
                    Welcome credit: AED 15
                  </p>
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="text-offer-body"
                  >
                    Lands in your wallet the moment you sign up. Spend it on
                    your next session booking.
                  </p>
                </div>
              </div>
              <Link href={SIGNUP_HREF} className="sm:shrink-0">
                <Button data-testid="button-offer-claim">Claim it</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Advantages */}
      <section className="px-5 pt-12">
        <div className="mx-auto max-w-2xl">
          <h2
            className="mb-1 text-center text-2xl font-bold sm:text-3xl"
            data-testid="text-advantages-title"
          >
            Why players switch
          </h2>
          <p
            className="mb-7 text-center text-sm text-muted-foreground"
            data-testid="text-advantages-subtitle"
          >
            Five reasons your old group can&apos;t match.
          </p>
          <div className="space-y-3">
            {ADVANTAGES.map(({ icon: Icon, title, body }, idx) => (
              <Card
                key={title}
                className="border-border/60"
                data-testid={`card-advantage-${idx}`}
              >
                <CardContent className="flex gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#00BFA5]/15">
                    <Icon className="h-4 w-4 text-[#006B5F]" />
                  </div>
                  <div>
                    <h3
                      className="text-sm font-semibold text-foreground"
                      data-testid={`text-advantage-title-${idx}`}
                    >
                      {title}
                    </h3>
                    <p
                      className="mt-0.5 text-sm text-muted-foreground"
                      data-testid={`text-advantage-body-${idx}`}
                    >
                      {body}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof — sample leaderboard */}
      <section className="px-5 pt-12">
        <div className="mx-auto max-w-2xl">
          <h2
            className="mb-1 text-center text-2xl font-bold sm:text-3xl"
            data-testid="text-social-proof-title"
          >
            Real players. Real rankings.
          </h2>
          <p
            className="mb-5 text-center text-sm text-muted-foreground"
            data-testid="text-social-proof-subtitle"
          >
            A look at this month&apos;s leaderboard.
          </p>
          <Card className="border-border/60" data-testid="card-sample-leaderboard">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {[
                  { rank: 1, name: 'Arjun A.', score: 1742, games: 38, badge: 'Smasher' },
                  { rank: 2, name: 'Ramya S.', score: 1698, games: 41, badge: 'Wall' },
                  { rank: 3, name: 'Mridul K.', score: 1664, games: 29, badge: 'Hustler' },
                  { rank: 4, name: 'Priya N.', score: 1631, games: 33, badge: 'Clutch' },
                  { rank: 5, name: 'Sundeep M.', score: 1607, games: 36, badge: 'Smasher' },
                ].map((row) => (
                  <div
                    key={row.rank}
                    className="flex items-center gap-3 px-4 py-3"
                    data-testid={`row-leaderboard-${row.rank}`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        row.rank === 1
                          ? 'bg-[#00BFA5] text-[#003D3A]'
                          : 'bg-muted text-muted-foreground'
                      }`}
                      data-testid={`text-leaderboard-rank-${row.rank}`}
                    >
                      {row.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold text-foreground"
                        data-testid={`text-leaderboard-name-${row.rank}`}
                      >
                        {row.name}
                      </p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        data-testid={`text-leaderboard-games-${row.rank}`}
                      >
                        {row.games} games this month
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0"
                      data-testid={`badge-leaderboard-tag-${row.rank}`}
                    >
                      {row.badge}
                    </Badge>
                    <div
                      className="w-14 shrink-0 text-right text-sm font-bold tabular-nums text-foreground"
                      data-testid={`text-leaderboard-score-${row.rank}`}
                    >
                      {row.score}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <p
            className="mt-3 text-center text-xs text-muted-foreground"
            data-testid="text-social-proof-footnote"
          >
            Sample view. Your score updates after every match you play.
          </p>
        </div>
      </section>

      {/* Secondary CTA */}
      <section className="px-5 pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-secondary-cta-line">
            Built in the UAE. Used at venues across Dubai &amp; Abu Dhabi.
          </p>
          <Link href={SIGNUP_HREF}>
            <Button
              variant="outline"
              size="lg"
              className="mt-4"
              data-testid="button-secondary-claim"
            >
              Sign up &amp; grab AED 15
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/marketplace/login"
              className="text-primary hover:underline"
              data-testid="link-login"
            >
              Log in
            </Link>
          </p>
        </div>
      </section>

      {/* Sticky bottom CTA (mobile-first) */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p
              className="truncate text-xs font-semibold text-foreground"
              data-testid="text-sticky-title"
            >
              AED 15 welcome credit
            </p>
            <p
              className="truncate text-[11px] text-muted-foreground"
              data-testid="text-sticky-subtitle"
            >
              Auto-applied at signup
            </p>
          </div>
          <Link href={SIGNUP_HREF} className="shrink-0">
            <Button data-testid="button-sticky-claim">
              Claim AED 15
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
