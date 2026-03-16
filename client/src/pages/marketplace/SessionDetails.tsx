import { useQuery } from '@tanstack/react-query';
import { useParams, useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';
import { Calendar, MapPin, Clock, Users, CreditCard, ArrowLeft, AlertTriangle, Info, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import type { BookableSessionWithAvailability } from '@shared/schema';

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };

export default function SessionDetails() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useMarketplaceAuth();
  const [, setLocation] = useLocation();

  const { data: session, isLoading } = useQuery<BookableSessionWithAvailability>({
    queryKey: ['/api/marketplace/sessions', id],
  });

  const handleBookNow = () => {
    setLocation(`/marketplace/checkout/${id}`);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold mb-2">Session not found</h2>
        <Link href="/marketplace/book">
          <Button variant="ghost">Back to sessions</Button>
        </Link>
      </div>
    );
  }

  const capacityPercent = session.capacity > 0
    ? Math.round((session.totalBookings / session.capacity) * 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp}>
          <Link href="/marketplace/book">
            <Button variant="ghost" size="sm" className="mb-4 gap-1" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" /> Back to sessions
            </Button>
          </Link>
        </motion.div>

        <motion.div variants={fadeInUp}>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-2xl mb-1" data-testid="text-session-title">{session.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(session.date), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
                <Badge
                  variant={session.spotsRemaining > 0 ? 'secondary' : 'destructive'}
                  className="shrink-0"
                >
                  {session.spotsRemaining > 0 ? `${session.spotsRemaining} spots left` : 'Full'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: Calendar, label: 'Date', value: format(new Date(session.date), 'EEEE, MMMM d, yyyy') },
                  { icon: Clock, label: 'Time', value: `${session.startTime} - ${session.endTime}` },
                  { icon: MapPin, label: 'Venue', value: session.venueName, sub: session.venueLocation },
                  { icon: Users, label: 'Capacity', value: `${session.courtCount} courts, ${session.capacity} max players` },
                  { icon: Banknote, label: 'Price', value: `AED ${session.priceAed} per player` },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">{item.label}</div>
                      <div className="font-medium text-sm">{item.value}</div>
                      {item.sub && <div className="text-xs text-muted-foreground">{item.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Capacity</span>
                  <span className="font-medium">{session.totalBookings} / {session.capacity} booked</span>
                </div>
                <Progress value={capacityPercent} className="h-2" />
              </div>

              {session.description && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4 text-secondary" /> About this session
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{session.description}</p>
                </div>
              )}

              <div className="flex gap-3 p-4 rounded-md border border-orange-500/20 bg-orange-500/5">
                <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-orange-700 dark:text-orange-400 mb-1">Cancellation Policy</p>
                  <ul className="text-muted-foreground space-y-0.5 text-xs leading-relaxed">
                    <li>Cancellations within 12 hours of the session are subject to full payment.</li>
                    <li>Last-hour cancellations are subject to full payment.</li>
                    <li>No-shows may be charged 150% of the session price.</li>
                  </ul>
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground">Price per player</div>
                    <div className="text-3xl font-bold" data-testid="text-session-price">AED {session.priceAed}</div>
                  </div>
                  {isAuthenticated ? (
                    <Button
                      size="lg"
                      className="gap-2"
                      disabled={session.spotsRemaining <= 0}
                      onClick={handleBookNow}
                      data-testid="button-book-now"
                    >
                      <CreditCard className="h-5 w-5" />
                      {session.spotsRemaining <= 0 ? 'Session Full' : 'Book & Pay Now'}
                    </Button>
                  ) : (
                    <Link href="/marketplace/login">
                      <Button size="lg" className="gap-2" data-testid="button-login-to-book">
                        Log in to book
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
