import { Card, CardContent } from '@/components/ui/card';
import {
  Zap, Clock, Users2, BarChart3,
  TrendingUp, TrendingDown, Coffee,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.07 } } };

function SectionHeading({ label, title, subtitle }: { label?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-widest text-secondary mb-2">{label}</p>
      )}
      <h2 className="text-2xl md:text-3xl font-bold mb-2">{title}</h2>
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2.5 border-b last:border-0 ${highlight ? 'text-secondary font-semibold' : ''}`}>
      <span className="text-sm">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${highlight ? 'text-secondary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <ChevronRight className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}

const TIERS = [
  { name: 'Novice', range: '10–39', skid: '1.0–3.9', note: 'Entry level', color: 'bg-success/10 text-success border-success/20' },
  { name: 'Beginner', range: '40–69', skid: '4.0–6.9', note: 'Default start: 50', color: 'bg-success/10 text-success border-success/20' },
  { name: 'Intermediate', range: '70–89', skid: '7.0–8.9', note: 'Calibration cap', color: 'bg-warning/10 text-warning border-warning/20' },
  { name: 'Competitive', range: '90–109', skid: '9.0–10.9', note: 'Earned through play', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { name: 'Advanced', range: '110–159', skid: '11.0–15.9', note: 'Must be earned', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  { name: 'Professional', range: '160–200', skid: '16.0–20.0', note: 'Elite', color: 'bg-destructive/10 text-destructive border-destructive/20' },
];

const WIN_ROWS = [
  { label: 'Win vs. much stronger (+20)', value: '+15' },
  { label: 'Win vs. stronger (+11–20)', value: '+10' },
  { label: 'Win vs. similar (0–10 stronger)', value: '+8' },
  { label: 'Win vs. similar (0–10 weaker)', value: '+5' },
  { label: 'Win vs. weaker (11–20)', value: '+4' },
  { label: 'Win vs. much weaker (+20)', value: '+2' },
];

const LOSS_ROWS = [
  { label: 'Loss vs. much weaker (+20)', value: '−15' },
  { label: 'Loss vs. weaker (11–20)', value: '−10' },
  { label: 'Loss vs. similar (0–10 weaker)', value: '−8' },
  { label: 'Loss vs. similar (0–10 stronger)', value: '−5' },
  { label: 'Loss vs. stronger (11–20)', value: '−4' },
  { label: 'Loss vs. much stronger (+20)', value: '−2' },
];

const K_ROWS = [
  { label: 'First 3 games (calibration)', value: '× 1.8', highlight: true },
  { label: 'Return after 14+ day absence', value: '× 1.2', highlight: true },
  { label: '3–9 games played', value: '× 1.0' },
  { label: '10–29 games played', value: '× 0.65' },
  { label: '30+ games played', value: '× 0.40' },
];

const DECAY_ROWS = [
  { label: '0–1 weeks inactive', value: 'No decay' },
  { label: '2–3 weeks inactive', value: '−3 pts / week' },
  { label: '4–7 weeks inactive', value: '−4 pts / week' },
  { label: '8+ weeks inactive', value: '−5 pts / week' },
];

const BALANCE_STEPS = [
  {
    num: '1',
    title: 'Tier Dispersion',
    desc: 'Prefer matches where all 4 players share the same tier — minimise tier span.',
  },
  {
    num: '2',
    title: 'Skill Gap',
    desc: 'Minimise the difference between each team\'s average score — the primary balance metric.',
  },
  {
    num: '3',
    title: 'Partner Rotation',
    desc: 'Prefer fresh pairings. Repeated pair-ups add +15 penalty (max +30 per pair, +60 total). Only used as tiebreaker when two splits are within 0.01 skill gap.',
  },
  {
    num: '4',
    title: 'Score Variance',
    desc: 'Prefer homogeneous groups where all 4 scores cluster tightly around the group mean.',
  },
];

export default function ScoringGuide() {
  usePageTitle('Scoring Guide');
  return (
    <div className="flex flex-col" data-testid="page-scoring-guide">

      {/* ── Hero ── */}
      <section className="relative py-20 md:py-28 px-4 bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(217,100%,22%)] via-primary to-[hsl(217,80%,30%)]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />
        <motion.div
          className="relative max-w-3xl mx-auto text-center"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.p variants={fadeInUp} className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/60 mb-4">
            ShuttleIQ Dubai · Algorithm Guide v1.0
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-extrabold text-primary-foreground mb-5 leading-tight tracking-tight"
            data-testid="text-scoring-guide-title"
          >
            How It Works
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            className="text-base md:text-lg text-primary-foreground/75 max-w-2xl mx-auto leading-relaxed"
          >
            Your complete guide to skill scoring, queue priority, and matchmaking —
            so every game is fair, competitive, and genuinely earned.
          </motion.p>
        </motion.div>
      </section>

      {/* ── 01 Skill Tiers ── */}
      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="01 — Skill Tiers" title="Your Skill Score & Tier" subtitle="Every player has a score between 10 and 200 that determines their tier." />
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {TIERS.map((tier) => (
              <motion.div key={tier.name} variants={fadeInUp}>
                <Card className={`h-full border ${tier.color}`}>
                  <CardContent className="p-4 text-center">
                    <p className="font-bold text-base mb-1">{tier.name}</p>
                    <p className="text-2xl font-extrabold tabular-nums mb-1">{tier.range}</p>
                    <p className="text-xs opacity-70 mb-2">SKID {tier.skid}</p>
                    <p className="text-xs opacity-80 leading-snug">{tier.note}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeInUp}>
            <Card className="bg-card/60">
              <CardContent className="p-5">
                <ul className="space-y-2">
                  <BulletItem>New players start at score <strong>50</strong> (mid-Beginner).</BulletItem>
                  <BulletItem>Self-reported Advanced or Professional players are capped at <strong>90</strong> (mid-Intermediate) — upper tiers must be earned through gameplay.</BulletItem>
                  <BulletItem><strong>SKID</strong> (Skill ID) = score ÷ 10, giving a 1.0–20.0 display scale.</BulletItem>
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

      {/* ── 02 Scoring Engine ── */}
      <section className="py-16 md:py-20 px-4 bg-card/50">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="02 — Scoring Engine" title="Post-Game Score Formula" />
          </motion.div>

          <motion.div variants={fadeInUp} className="mb-8">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Formula</p>
                <p className="font-mono text-base md:text-lg font-bold text-foreground">
                  Score Change = round( Base × Contribution × K-Factor )
                </p>
                <p className="text-xs text-muted-foreground mt-2">Three inputs multiplied together, then rounded to the nearest whole number. Always at least ±1.</p>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Factor 1: Base Adjustment */}
            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-secondary">1</span>
                    </div>
                    <h3 className="font-semibold text-sm">Base Adjustment</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">Win/loss result vs. opponent skill gap. +2 or −2 extra if point margin &gt; 10.</p>
                  <div className="mb-3">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp className="h-3 w-3 text-success" />
                      <span className="text-xs font-semibold text-success uppercase tracking-wide">Wins</span>
                    </div>
                    {WIN_ROWS.map((r) => (
                      <InfoRow key={r.label} label={r.label} value={r.value} />
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingDown className="h-3 w-3 text-destructive" />
                      <span className="text-xs font-semibold text-destructive uppercase tracking-wide">Losses</span>
                    </div>
                    {LOSS_ROWS.map((r) => (
                      <InfoRow key={r.label} label={r.label} value={r.value} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Factor 2: Contribution */}
            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-secondary">2</span>
                    </div>
                    <h3 className="font-semibold text-sm">Contribution Factor</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Adjusts for how much of your team's strength you carried. The stronger partner gains or loses more; the weaker one gains or loses less.
                  </p>
                  <Card className="bg-muted/40 border-0">
                    <CardContent className="p-3">
                      <p className="font-mono text-xs text-center leading-relaxed">
                        factor = 1.0 +<br />(SKID_share − 0.5) × 0.6<br /><br />
                        SKID_share = your SKID ÷<br />(your SKID + partner SKID)
                      </p>
                    </CardContent>
                  </Card>
                  <div className="mt-4 space-y-0">
                    <InfoRow label="Equal partners" value="× 1.00" />
                    <InfoRow label="You are the dominant partner" value="up to × 1.27" highlight />
                    <InfoRow label="You are the weaker partner" value="down to × 0.73" />
                    <InfoRow label="Partner unknown" value="× 1.00" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Factor 3: K-Factor */}
            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-secondary">3</span>
                    </div>
                    <h3 className="font-semibold text-sm">K-Factor</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Controls how fast your score moves. New and returning players move faster; established players stabilise over time.
                  </p>
                  {K_ROWS.map((r) => (
                    <InfoRow key={r.label} label={r.label} value={r.value} highlight={r.highlight} />
                  ))}
                  <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-md">
                    <p className="text-xs text-warning font-semibold mb-1">Calibration cap</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">Your first 3 games cannot push your score above 120, regardless of results.</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </div>

          {/* Tier boundary note */}
          <motion.div variants={fadeInUp} className="mt-6">
            <Card className="bg-card/60">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-2">Tier Boundary Protection</p>
                <ul className="space-y-2">
                  <BulletItem>A <strong>win</strong> cannot push you across a tier boundary unless your opponent was already in that higher tier.</BulletItem>
                  <BulletItem>A <strong>loss</strong> cannot drop you below your current tier's floor when the opponent is in the same tier or higher — you can only drop tiers by losing to someone ranked <em>below</em> you.</BulletItem>
                  <BulletItem>Your displayed tier only officially changes after your score has been in the new tier for <strong>3 consecutive games</strong> (tier buffer).</BulletItem>
                </ul>
              </CardContent>
            </Card>
          </motion.div>

        </motion.div>
      </section>

      {/* ── 03 Inactivity ── */}
      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="03 — Inactivity" title="Decay & Return Boost" />
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">Inactivity Decay</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Miss 14+ days and your score gradually drops. Decay is always relative to your score at your last game — never compounded run-to-run.
                  </p>
                  {DECAY_ROWS.map((r) => (
                    <InfoRow key={r.label} label={r.label} value={r.value} />
                  ))}
                  <div className="mt-4 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground">Total decay is capped at <strong>−50 points</strong> maximum, no matter how long you're away.</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="h-5 w-5 text-secondary" />
                    <h3 className="font-semibold">Return Boost</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                    Back after 14+ days? The system knows your true skill likely exceeds your decayed score.
                  </p>
                  <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-md mb-4">
                    <p className="text-sm font-semibold text-secondary text-center">K-Factor raised to 1.2 for your next 2 games</p>
                    <p className="text-xs text-center text-muted-foreground mt-1">Letting you recover lost points faster</p>
                  </div>
                  <ul className="space-y-2">
                    <BulletItem>Applies automatically — no action needed</BulletItem>
                    <BulletItem>Lasts exactly 2 games, then reverts to normal</BulletItem>
                    <BulletItem>Stacks on top of your regular K-Factor tier</BulletItem>
                    <BulletItem>Works whether you lost 5 points or 50 to decay</BulletItem>
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

          </div>
        </motion.div>
      </section>

      {/* ── 04 Queue System ── */}
      <section className="py-16 md:py-20 px-4 bg-card/50">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="04 — Queue System" title="How the Queue Works" subtitle="The queue is ordered and session-scoped. Matchmaking pulls players from the front." />
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="h-5 w-5 text-secondary" />
                    <h3 className="font-semibold">Priority Score Formula</h3>
                  </div>
                  <Card className="bg-muted/40 border-0 mb-4">
                    <CardContent className="p-3">
                      <p className="font-mono text-xs leading-relaxed">
                        priority =<br />
                        &nbsp;&nbsp;(queue_position × 25)<br />
                        &nbsp;&nbsp;+ (consec_games × 10)&nbsp;&nbsp;← if needs rest<br />
                        &nbsp;&nbsp;+ (total_games × 0.1)&nbsp;&nbsp;&nbsp;← minor tiebreaker<br />
                        &nbsp;&nbsp;− (games_waited × 6)&nbsp;&nbsp;&nbsp;← waiting bonus<br />
                        &nbsp;&nbsp;− (session_deficit × 40)&nbsp;← fairness boost
                      </p>
                    </CardContent>
                  </Card>
                  <p className="text-xs text-muted-foreground mb-4 font-medium">Lower score = higher priority to play next</p>
                  <ul className="space-y-2">
                    <BulletItem>Queue position dominates — the system is fundamentally FIFO</BulletItem>
                    <BulletItem>Rest penalty nudges players with 2+ consecutive games back slightly</BulletItem>
                    <BulletItem>Waiting bonus pulls sat-out players back up the order</BulletItem>
                    <BulletItem>Session equity boost (× 40) gives priority to players who've played fewer games in the session than average — keeping court time fair across the group</BulletItem>
                    <BulletItem>After 1 game out: consecutive count is halved, not zeroed</BulletItem>
                    <BulletItem>After 2 games out: consecutive count is fully reset to 0</BulletItem>
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Users2 className="h-5 w-5 text-secondary" />
                    <h3 className="font-semibold">Candidate Window & Sit-Out</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    The engine narrows to a dynamic window from the front of the queue before scoring players.
                  </p>
                  <div className="mb-4">
                    <InfoRow label="Auto-assign (one court)" value="Queue × 35%, clamp 6–16" />
                    <InfoRow label="Suggestions (multiple options)" value="Queue × 50%, clamp 8–24" />
                  </div>
                  <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-md mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Coffee className="h-4 w-4 text-secondary" />
                      <p className="text-xs font-semibold text-secondary">Voluntary Sit-Out</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">Players can skip a round, keep their queue position, and are auto-reinstated after one game.</p>
                  </div>
                  <ul className="space-y-2">
                    <BulletItem>Losers re-enter the queue first; winners wait slightly longer</BulletItem>
                    <BulletItem>Tier grouping mode attempts same-tier groups, then expands to adjacent tiers</BulletItem>
                    <BulletItem>Up to 20 combos scored; top 15 shown as admin suggestions</BulletItem>
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

          </div>
        </motion.div>
      </section>

      {/* ── 05 Team Balancing ── */}
      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading
              label="05 — Team Balancing"
              title="How Teams Are Split"
              subtitle="For every group of 4 players there are exactly 3 possible team splits. ShuttleIQ scores all 3 and picks the best using a four-level priority sort."
            />
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {BALANCE_STEPS.map((step) => (
              <motion.div key={step.num} variants={fadeInUp}>
                <Card className="h-full">
                  <CardContent className="p-5">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center mb-3">
                      <span className="text-sm font-bold text-primary-foreground">{step.num}</span>
                    </div>
                    <h3 className="font-semibold text-sm mb-2">{step.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div variants={fadeInUp}>
            <Card className="bg-card/60">
              <CardContent className="p-5">
                <p className="text-sm font-semibold mb-2">Important</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Partner Rotation is only used as a tiebreaker when two splits have a skill gap difference of less than 0.01. It never overrides a clearly better balanced split.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Closing ── */}
      <section className="py-16 md:py-20 px-4 bg-primary">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={stagger}
        >
          <motion.p
            variants={fadeInUp}
            className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/60 mb-4"
          >
            ShuttleIQ Dubai
          </motion.p>
          <motion.p
            variants={fadeInUp}
            className="text-xl md:text-2xl font-bold text-primary-foreground mb-3"
          >
            Every score is earned. Every match is balanced.
          </motion.p>
          <motion.p
            variants={fadeInUp}
            className="text-primary-foreground/70 text-sm"
          >
            Questions? Speak to your session admin.
          </motion.p>
        </motion.div>
      </section>

    </div>
  );
}
