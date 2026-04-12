import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users, DollarSign, Zap, Heart, MapPin, CheckCircle2,
  ArrowRight, Star, ShieldCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { usePageTitle } from '@/hooks/usePageTitle';

const APPLY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSccGm5-cpPDJ_495b_k8Wg9bc98SEHu0JrGktKAYkfUO_2Ezg/viewform?usp=header';

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

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 text-secondary shrink-0 mt-0.5" />
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}

export default function JoinTheCrew() {
  usePageTitle('Join the Crew');
  return (
    <div className="flex flex-col" data-testid="page-join-the-crew">

      {/* ── Hero ── */}
      <section className="relative py-20 md:py-32 px-4 bg-primary overflow-hidden">
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
            We're Hiring
          </motion.p>
          <motion.h1
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-extrabold text-primary-foreground mb-5 leading-tight tracking-tight"
            data-testid="text-hiring-hero-title"
          >
            Join the ShuttleIQ Crew{' '}
            <span className="text-secondary text-2xl md:text-3xl font-semibold">(Limited Slots)</span>
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            className="text-lg md:text-xl font-semibold text-secondary mb-4"
          >
            Love badminton? Love people?<br />Get paid to be part of the game.
          </motion.p>
          <motion.p
            variants={fadeInUp}
            className="text-base text-primary-foreground/70 mb-10 max-w-xl mx-auto leading-relaxed"
          >
            We're building Dubai's most fun badminton community — and we're looking for a few high-energy individuals to lead our sessions.
          </motion.p>
          <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-3">
            <a href={APPLY_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="secondary" className="gap-2 text-base" data-testid="button-apply-hero">
                Apply Now
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Why Join ── */}
      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="The Perks" title="Why Join ShuttleIQ?" />
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Users, text: 'Be part of a fast-growing badminton community in Dubai' },
              { icon: Heart, text: 'Meet amazing people every week' },
              { icon: DollarSign, text: 'Get paid while staying active' },
              { icon: Star, text: 'Free / discounted games' },
              { icon: Zap, text: 'Be a key part of building something exciting' },
            ].map((item) => (
              <motion.div key={item.text} variants={fadeInUp}>
                <Card className="h-full" data-testid={`card-perk-${item.text.slice(0, 10).replace(/\s/g, '-').toLowerCase()}`}>
                  <CardContent className="p-5 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-secondary" />
                    </div>
                    <p className="text-sm leading-relaxed pt-1">{item.text}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── Role ── */}
      <section className="py-16 md:py-20 px-4 bg-card/50">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading
              label="Open Role"
              title="Court Captain"
              subtitle="Session Host · Part-Time"
            />
          </motion.div>
          <motion.p variants={fadeInUp} className="text-muted-foreground mb-8 leading-relaxed max-w-2xl">
            You are the heartbeat of the session. You don't just manage games — you create the experience.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Responsibilities</p>
                <ul className="space-y-3">
                  <BulletItem>Manage player queues and rotations using ShuttleIQ</BulletItem>
                  <BulletItem>Ensure smooth flow of games across courts</BulletItem>
                  <BulletItem>Welcome players and help new members settle in</BulletItem>
                  <BulletItem>Keep the energy fun, fair, and inclusive</BulletItem>
                  <BulletItem>Resolve small conflicts or confusion during games</BulletItem>
                  <BulletItem>Represent the ShuttleIQ vibe on court</BulletItem>
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Who This Is For ── */}
      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="Is This You?" title="Who This Is For" />
          </motion.div>
          <motion.div variants={fadeInUp}>
            <Card>
              <CardContent className="p-6">
                <ul className="space-y-3">
                  <BulletItem>Female badminton player (upper-intermediate+)</BulletItem>
                  <BulletItem>Confident and people-friendly</BulletItem>
                  <BulletItem>Naturally takes charge in group situations</BulletItem>
                  <BulletItem>Loves badminton and plays regularly</BulletItem>
                  <BulletItem>Reliable and always on time</BulletItem>
                  <BulletItem>Positive attitude and high energy</BulletItem>
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Requirements + Compensation + Locations ── */}
      <section className="py-16 md:py-20 px-4 bg-card/50">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={stagger}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Requirements */}
            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="h-5 w-5 text-secondary" />
                    <h3 className="font-semibold">Requirements</h3>
                  </div>
                  <ul className="space-y-3">
                    <BulletItem>Own visa (mandatory)</BulletItem>
                    <BulletItem>Valid UAE driving license</BulletItem>
                    <BulletItem>Access to a car</BulletItem>
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

            {/* Compensation */}
            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign className="h-5 w-5 text-secondary" />
                    <h3 className="font-semibold">Compensation</h3>
                  </div>
                  <ul className="space-y-3">
                    <BulletItem>AED 100 per session</BulletItem>
                    <BulletItem>AED 2,400 - AED 3,000 per month</BulletItem>
                    <BulletItem>Growth opportunity into a Community Manager role</BulletItem>
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

            {/* Locations */}
            <motion.div variants={fadeInUp}>
              <Card className="h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="h-5 w-5 text-secondary" />
                    <h3 className="font-semibold">Locations</h3>
                  </div>
                  <ul className="space-y-3">
                    <BulletItem>Al Barsha</BulletItem>
                    <BulletItem>Silicon Oasis</BulletItem>
                  </ul>
                </CardContent>
              </Card>
            </motion.div>

          </div>
        </motion.div>
      </section>

      {/* ── How to Apply ── */}
      <section className="py-16 md:py-20 px-4">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          variants={stagger}
        >
          <motion.div variants={fadeInUp}>
            <SectionHeading label="Next Step" title="How to Apply" />
          </motion.div>
          <motion.p variants={fadeInUp} className="text-muted-foreground mb-8 leading-relaxed">
            Apply through our Google Form. It takes less than 2 minutes.
          </motion.p>
          <motion.div variants={fadeInUp}>
            <a href={APPLY_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="gap-2 text-base px-8" data-testid="button-apply-now">
                Apply Now
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <p className="text-xs text-muted-foreground mt-4">
              Shortlisted candidates will be invited for a trial session.
            </p>
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
            className="text-lg md:text-xl italic text-primary-foreground/80 leading-relaxed mb-6"
            data-testid="text-closing"
          >
            "If you've ever been on court and thought,<br />
            <span className="text-primary-foreground font-semibold not-italic">'I can run this better…'</span><br />
            This is your chance."
          </motion.p>
          <motion.div variants={fadeInUp}>
            <a href={APPLY_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="secondary" className="gap-2" data-testid="button-apply-closing">
                Apply Now <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </motion.div>
        </motion.div>
      </section>

    </div>
  );
}
