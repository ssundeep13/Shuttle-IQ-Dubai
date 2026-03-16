import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LogOut, Calendar, MapPin, Plus, Trash2, Eye, Users, Activity, Clock, CheckCircle, LayoutGrid, Trophy, FileDown, Search, Link2, ShoppingBag, DollarSign, Pencil, Play, Banknote, CreditCard } from 'lucide-react';
import { queryClient as qc, apiRequest } from '@/lib/queryClient';
import { SessionSetupWizard } from '@/components/SessionSetupWizard';
import { PlayerImport } from '@/components/PlayerImport';
import { GameHistoryExport } from '@/components/GameHistoryExport';
import { Leaderboard } from '@/components/Leaderboard';
import { EditPlayerModal } from '@/components/EditPlayerModal';
import { useToast } from '@/hooks/use-toast';
import type { Session, Player, BookableSessionWithAvailability, BookingWithDetails, MarketplaceUser } from '@shared/schema';

interface MarketplaceUserWithLinkedPlayer extends MarketplaceUser {
  linkedPlayer: { id: string; name: string; shuttleIqId: string } | null;
}

interface PlayerSearchResult {
  id: number;
  name: string;
  shuttleIqId: string;
  level: string;
}

export default function SessionsManagement() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('sessions');
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [bookingsSession, setBookingsSession] = useState<Session | null>(null);

  const { data: allSessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['/api/sessions'],
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const { data: bookableSessions = [] } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  useEffect(() => {
    if (!showCreateSession) {
      setWizardKey(prev => prev + 1);
    }
  }, [showCreateSession]);

  const sessions = allSessions;

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setSessionToDelete(null);
    },
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ playerId, updates }: { playerId: string; updates: Partial<Player> }) => {
      return await apiRequest('PATCH', `/api/players/${playerId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return await apiRequest('DELETE', `/api/players/${playerId}`, null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/queue'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'], exact: false });
    },
  });

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/admin/login');
    }
  };

  const handleSessionCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
    setShowCreateSession(false);
  };

  const handleDeleteSession = async () => {
    if (sessionToDelete) {
      await deleteSessionMutation.mutateAsync(sessionToDelete.id);
    }
  };

  const handleActivateSession = async (session: Session) => {
    try {
      await apiRequest('PATCH', `/api/sessions/${session.id}`, { status: 'active' });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      toast({ title: "Session activated", description: `"${session.venueName}" is now active` });
    } catch (err: any) {
      const message = err?.error || err?.message || "Failed to activate session";
      toast({ title: "Cannot activate", description: message, variant: "destructive" });
    }
  };

  const handleResetStats = () => {
    players.forEach((player) => {
      updatePlayerMutation.mutate({
        playerId: player.id,
        updates: { gamesPlayed: 0, wins: 0 },
      });
    });
    toast({ title: "Stats reset", description: "All player statistics have been reset" });
  };

  const handleClearAllPlayers = () => {
    const playingPlayers = players.filter((p) => p.status === 'playing');
    if (playingPlayers.length > 0) {
      toast({ title: "Cannot clear players", description: "Cannot clear while games are in progress", variant: "destructive" });
      return;
    }
    players.forEach((player) => {
      deletePlayerMutation.mutate(player.id);
    });
    toast({ title: "Players cleared", description: "All players have been removed" });
  };

  const activeSessions = sessions.filter(s => s.status === 'active');
  const upcomingSessions = sessions.filter(s => s.status === 'upcoming' || s.status === 'draft');
  const endedSessions = sessions.filter(s => s.status === 'ended');

  const totalBookings = bookableSessions.reduce((sum, s) => sum + s.totalBookings, 0);
  const totalRevenue = bookableSessions.reduce((sum, s) => sum + (s.totalBookings * s.priceAed), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              <span className="text-primary">Shuttle</span>
              <span className="text-chart-2">IQ</span>
            </h1>
            <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
              {user?.email}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <TabsList data-testid="tabs-admin-dashboard">
              <TabsTrigger value="sessions" data-testid="tab-sessions">
                <LayoutGrid className="w-4 h-4 mr-2" />
                Sessions
              </TabsTrigger>
              <TabsTrigger value="players" data-testid="tab-players">
                <Users className="w-4 h-4 mr-2" />
                Players
              </TabsTrigger>
              <TabsTrigger value="marketplace-users" data-testid="tab-marketplace-users">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Marketplace Users
              </TabsTrigger>
            </TabsList>

            {activeTab === 'sessions' && (
              <Button 
                onClick={() => setShowCreateSession(true)}
                data-testid="button-create-session"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Session
              </Button>
            )}
          </div>

          <TabsContent value="sessions" className="mt-6 space-y-6">
            <SessionsTabContent 
              sessions={sessions}
              activeSessions={activeSessions}
              upcomingSessions={upcomingSessions}
              endedSessions={endedSessions}
              bookableSessions={bookableSessions}
              isLoading={isLoading}
              onView={(session) => navigate(`/session/${session.id}`)}
              onDelete={(session) => setSessionToDelete(session)}
              onViewBookings={(session) => setBookingsSession(session)}
              onActivate={handleActivateSession}
              totalBookings={totalBookings}
              totalRevenue={totalRevenue}
            />
          </TabsContent>

          <TabsContent value="players" className="mt-6 space-y-6">
            <PlayersTabContent 
              players={players}
              onResetStats={handleResetStats}
              onClearAllPlayers={handleClearAllPlayers}
            />
          </TabsContent>

          <TabsContent value="marketplace-users" className="mt-6 space-y-6">
            <MarketplaceUsersTabContent />
          </TabsContent>
        </Tabs>
      </main>

      {showCreateSession && (
        <div className="fixed inset-0 z-50">
          <div 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
            onClick={() => setShowCreateSession(false)}
            data-testid="modal-overlay" 
          />
          <div className="relative flex items-center justify-center min-h-screen p-4">
            <SessionSetupWizard 
              key={wizardKey}
              onSessionCreated={handleSessionCreated}
              onClose={() => setShowCreateSession(false)}
            />
          </div>
        </div>
      )}

      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{sessionToDelete?.venueName}"? 
              This will permanently delete all courts, games, and queue data for this session.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingsSheet 
        session={bookingsSession} 
        onClose={() => setBookingsSession(null)} 
      />
    </div>
  );
}

function SessionsTabContent({ 
  sessions, activeSessions, upcomingSessions, endedSessions, bookableSessions,
  isLoading, onView, onDelete, onViewBookings, onActivate, totalBookings, totalRevenue
}: { 
  sessions: Session[];
  activeSessions: Session[];
  upcomingSessions: Session[];
  endedSessions: Session[];
  bookableSessions: BookableSessionWithAvailability[];
  isLoading: boolean;
  onView: (session: Session) => void;
  onDelete: (session: Session) => void;
  onViewBookings: (session: Session) => void;
  onActivate: (session: Session) => void;
  totalBookings: number;
  totalRevenue: number;
}) {
  const getLinkedBookableSession = (sessionId: string) => {
    return bookableSessions.find(bs => bs.linkedSessionId === sessionId);
  };

  return (
    <>
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover-elevate" data-testid="kpi-total-sessions">
            <div className="p-2 rounded-md bg-accent/10">
              <LayoutGrid className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold" data-testid="count-total-sessions">{sessions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover-elevate" data-testid="kpi-active-sessions">
            <div className="p-2 rounded-md bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold" data-testid="count-active-sessions">{activeSessions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover-elevate" data-testid="kpi-upcoming-sessions">
            <div className="p-2 rounded-md bg-chart-2/10">
              <Clock className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Upcoming</p>
              <p className="text-2xl font-bold" data-testid="count-upcoming-sessions">{upcomingSessions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover-elevate" data-testid="kpi-total-bookings">
            <div className="p-2 rounded-md bg-chart-2/10">
              <Users className="w-5 h-5 text-chart-2" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bookings</p>
              <p className="text-2xl font-bold" data-testid="count-total-bookings">{totalBookings}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover-elevate" data-testid="kpi-total-revenue">
            <div className="p-2 rounded-md bg-success/10">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-2xl font-bold" data-testid="count-total-revenue">AED {totalRevenue}</p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <SessionSection
            title="Active Sessions"
            icon={<Activity className="w-5 h-5 text-primary" />}
            iconBg="bg-primary/10"
            sessions={activeSessions}
            badge={<Badge variant="default" data-testid="badge-active-count">{activeSessions.length}</Badge>}
            emptyMessage="No active sessions"
            emptySubMessage="Create a new session to get started"
            onView={onView}
            onDelete={onDelete}
            onViewBookings={onViewBookings}
            onActivate={onActivate}
            getLinkedBookableSession={getLinkedBookableSession}
          />

          {upcomingSessions.length > 0 && (
            <SessionSection
              title="Upcoming Sessions"
              icon={<Clock className="w-5 h-5 text-chart-2" />}
              iconBg="bg-chart-2/10"
              sessions={upcomingSessions}
              badge={<Badge variant="secondary" data-testid="badge-upcoming-count">{upcomingSessions.length}</Badge>}
              onView={onView}
              onDelete={onDelete}
              onViewBookings={onViewBookings}
              onActivate={onActivate}
              getLinkedBookableSession={getLinkedBookableSession}
            />
          )}

          {endedSessions.length > 0 && (
            <SessionSection
              title="Ended Sessions"
              icon={<CheckCircle className="w-5 h-5 text-muted-foreground" />}
              iconBg="bg-muted"
              sessions={endedSessions}
              badge={<Badge variant="outline" data-testid="badge-ended-count">{endedSessions.length}</Badge>}
              onView={onView}
              onDelete={onDelete}
              onViewBookings={onViewBookings}
              onActivate={onActivate}
              getLinkedBookableSession={getLinkedBookableSession}
            />
          )}
        </div>
      )}
    </>
  );
}

function SessionSection({ 
  title, icon, iconBg, sessions, badge, emptyMessage, emptySubMessage,
  onView, onDelete, onViewBookings, onActivate, getLinkedBookableSession
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  sessions: Session[];
  badge: React.ReactNode;
  emptyMessage?: string;
  emptySubMessage?: string;
  onView: (session: Session) => void;
  onDelete: (session: Session) => void;
  onViewBookings: (session: Session) => void;
  onActivate: (session: Session) => void;
  getLinkedBookableSession: (sessionId: string) => BookableSessionWithAvailability | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-md ${iconBg}`}>{icon}</div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {badge}
      </div>
      {sessions.length === 0 && emptyMessage ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{emptyMessage}</p>
            {emptySubMessage && (
              <p className="text-sm text-muted-foreground/60 mt-1">{emptySubMessage}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              linkedBookable={getLinkedBookableSession(session.id)}
              onView={() => onView(session)}
              onDelete={() => onDelete(session)}
              onViewBookings={() => onViewBookings(session)}
              onActivate={() => onActivate(session)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ 
  session, linkedBookable, onView, onDelete, onViewBookings, onActivate
}: { 
  session: Session;
  linkedBookable?: BookableSessionWithAvailability;
  onView: () => void; 
  onDelete: () => void;
  onViewBookings: () => void;
  onActivate?: () => void;
}) {
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'upcoming': return 'secondary';
      case 'ended': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`session-card-${session.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={getStatusBadgeVariant(session.status)} className="capitalize">
                {session.status}
              </Badge>
              {linkedBookable && (
                <Badge variant="outline" className="text-xs gap-1">
                  <ShoppingBag className="h-3 w-3" />
                  {linkedBookable.totalBookings}/{linkedBookable.capacity}
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg truncate">{session.venueName}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{format(new Date(session.date), 'PPP')}</span>
          </div>
          {session.venueLocation && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span className="truncate">{session.venueLocation}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" />
            <span>{session.courtCount} courts</span>
          </div>
          {linkedBookable && (
            <>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>AED {linkedBookable.priceAed} / player</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span data-testid={`text-revenue-${session.id}`}>Revenue: AED {linkedBookable.totalBookings * linkedBookable.priceAed}</span>
              </div>
            </>
          )}
        </div>
        
        <div className="flex gap-2 pt-2 border-t flex-wrap">
          <Button 
            size="sm" 
            variant="default"
            className="flex-1"
            onClick={onView}
            data-testid={`button-view-${session.id}`}
          >
            <Eye className="w-4 h-4 mr-1" />
            Manage Queue
          </Button>
          {linkedBookable && (
            <Button
              size="sm"
              variant="outline"
              onClick={onViewBookings}
              data-testid={`button-bookings-${session.id}`}
            >
              <Users className="w-4 h-4 mr-1" />
              View Bookings
            </Button>
          )}
          {(session.status === 'draft' || session.status === 'upcoming') && onActivate && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={onActivate}
              data-testid={`button-activate-${session.id}`}
            >
              <Play className="w-4 h-4 mr-1" />
              Activate
            </Button>
          )}
          <Button 
            size="sm" 
            variant="ghost"
            onClick={onDelete}
            data-testid={`button-delete-${session.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BookingsSheet({ session, onClose }: { session: Session | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: bookableSessions = [] } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const linkedBookable = session ? bookableSessions.find(bs => bs.linkedSessionId === session.id) : null;

  const { data: bookings, isLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/sessions', linkedBookable?.id, 'bookings'],
    enabled: !!linkedBookable?.id,
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/sessions/${linkedBookable!.id}/bookings`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const attendMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/attend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (data) => {
      const qr = data.queueResult;
      if (qr?.added) {
        toast({ title: 'Checked in', description: 'Player added to session queue' });
      } else if (qr?.reason === 'no_player_link') {
        toast({ title: 'Checked in', description: 'No player profile linked — add them to the queue manually' });
      } else if (qr?.reason === 'no_session_link') {
        toast({ title: 'Checked in', description: 'No queue session linked — add them to the queue manually' });
      } else if (qr?.reason === 'already_in_queue') {
        toast({ title: 'Checked in', description: 'Player is already in the queue' });
      } else {
        toast({ title: 'Attendance marked' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', linkedBookable?.id, 'bookings'] });
    },
  });

  const cashPaidMutation = useMutation({
    mutationFn: async ({ bookingId, cashPaid }: { bookingId: string; cashPaid: boolean }) => {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/cash-paid`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cashPaid }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment status updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', linkedBookable?.id, 'bookings'] });
    },
  });

  const sessionRevenue = bookings?.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + b.amountAed, 0) || 0;

  return (
    <Sheet open={!!session} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{session?.venueName} — Bookings</SheetTitle>
        </SheetHeader>

        {linkedBookable && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
              <span className="text-muted-foreground">{linkedBookable.title}</span>
              <div className="flex items-center gap-3">
                <span data-testid="text-sheet-revenue">AED {sessionRevenue}</span>
                <Badge variant="outline">{bookings?.filter(b => b.status === 'attended').length || 0} attended</Badge>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
            ) : !bookings?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No bookings yet</div>
            ) : (
              <div className="space-y-2">
                {bookings.map((booking) => (
                  <Card key={booking.id} data-testid={`card-sheet-booking-${booking.id}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-medium text-sm">{booking.user?.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{booking.user?.email}</div>
                        </div>
                        <span className="text-sm font-medium">AED {booking.amountAed}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={booking.paymentMethod === 'cash' ? 'secondary' : 'outline'}
                          data-testid={`badge-method-${booking.id}`}
                        >
                          {booking.paymentMethod === 'cash' ? (
                            <><Banknote className="h-3 w-3 mr-1" /> Cash</>
                          ) : (
                            <><CreditCard className="h-3 w-3 mr-1" /> Card</>
                          )}
                        </Badge>
                        <Badge
                          variant={
                            booking.status === 'cancelled' ? 'destructive'
                            : (booking.paymentMethod === 'cash' && !booking.cashPaid) ? 'outline'
                            : booking.status === 'pending' ? 'outline'
                            : 'default'
                          }
                          className={booking.paymentMethod === 'cash' && !booking.cashPaid && booking.status !== 'cancelled' ? 'border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400' : ''}
                          data-testid={`badge-payment-${booking.id}`}
                        >
                          <DollarSign className="h-3 w-3 mr-1" />
                          {booking.status === 'cancelled'
                            ? 'Cancelled'
                            : booking.paymentMethod === 'cash'
                              ? (booking.cashPaid ? 'Cash Received' : 'Cash Pending')
                              : (booking.status === 'confirmed' || booking.status === 'attended' ? 'Paid' : 'Pending')
                          }
                        </Badge>
                        <Badge
                          variant={booking.status === 'attended' ? 'secondary' : 'outline'}
                          data-testid={`badge-checkin-${booking.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {booking.status === 'attended' ? 'Checked In' : 'Not Checked In'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {booking.paymentMethod === 'cash' && booking.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant={booking.cashPaid ? 'secondary' : 'outline'}
                            className="gap-1"
                            onClick={() => cashPaidMutation.mutate({ bookingId: booking.id, cashPaid: !booking.cashPaid })}
                            disabled={cashPaidMutation.isPending}
                            data-testid={`button-toggle-cash-${booking.id}`}
                          >
                            <Banknote className="h-3 w-3" />
                            {booking.cashPaid ? 'Mark Unpaid' : 'Mark Cash Paid'}
                          </Button>
                        )}
                        {booking.status === 'confirmed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 ml-auto"
                            onClick={() => attendMutation.mutate(booking.id)}
                            disabled={attendMutation.isPending}
                            data-testid={`button-sheet-attend-${booking.id}`}
                          >
                            <CheckCircle className="h-3 w-3" /> Check In
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {!linkedBookable && session && (
          <div className="mt-4 py-8 text-center text-muted-foreground text-sm">
            This session has no marketplace listing. Create new sessions with marketplace enabled to see bookings here.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PlayersTabContent({ players, onResetStats, onClearAllPlayers }: {
  players: Player[];
  onResetStats: () => void;
  onClearAllPlayers: () => void;
}) {
  const [subTab, setSubTab] = useState('registry');

  return (
    <Tabs value={subTab} onValueChange={setSubTab}>
      <TabsList className="mb-4">
        <TabsTrigger value="registry" data-testid="subtab-registry">
          <Users className="w-4 h-4 mr-2" />
          Registry
        </TabsTrigger>
        <TabsTrigger value="leaderboard" data-testid="subtab-leaderboard">
          <Trophy className="w-4 h-4 mr-2" />
          Leaderboard
        </TabsTrigger>
        <TabsTrigger value="import" data-testid="subtab-import">
          <Plus className="w-4 h-4 mr-2" />
          Import
        </TabsTrigger>
        <TabsTrigger value="export" data-testid="subtab-export">
          <FileDown className="w-4 h-4 mr-2" />
          Export
        </TabsTrigger>
      </TabsList>

      <TabsContent value="registry">
        <PlayerRegistrySubTab players={players} />
      </TabsContent>

      <TabsContent value="leaderboard">
        <Leaderboard
          players={players}
          onResetStats={onResetStats}
          onClearAllPlayers={onClearAllPlayers}
        />
      </TabsContent>

      <TabsContent value="import">
        <Card>
          <CardHeader>
            <CardTitle>Player Import</CardTitle>
            <CardDescription>
              Import player data from CSV files or copy-paste from Excel.
              Players can be imported before or after creating sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlayerImport />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="export">
        <Card>
          <CardHeader>
            <CardTitle>Game History Export</CardTitle>
            <CardDescription>Download game scores and statistics from any session</CardDescription>
          </CardHeader>
          <CardContent>
            <GameHistoryExport />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function PlayerRegistrySubTab({ players }: { players: Player[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: string) => apiRequest('DELETE', `/api/players/${playerId}`),
    onSuccess: () => {
      toast({ title: 'Player deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      setDeletingPlayer(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete player', variant: 'destructive' });
    },
  });

  const filteredPlayers = players.filter(player => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.shuttleIqId?.toLowerCase().includes(query) ||
      player.externalId?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">All Players ({players.length})</h2>
      </div>
      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ShuttleIQ ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-registry-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'No players found matching your search' : 'No players registered yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPlayers.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                  data-testid={`registry-player-${player.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{player.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {player.shuttleIqId || 'No ID'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                      <span>{player.gender === 'Male' ? 'M' : 'F'}</span>
                      <span>{player.level}</span>
                      <span>{player.gamesPlayed} games</span>
                      <span>{player.wins} wins</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingPlayer(player); setEditModalOpen(true); }}
                      data-testid={`button-edit-registry-${player.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingPlayer(player)}
                      data-testid={`button-delete-registry-${player.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EditPlayerModal
        player={editingPlayer}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
      />

      <AlertDialog open={!!deletingPlayer} onOpenChange={(open) => { if (!open) setDeletingPlayer(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Player</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingPlayer?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-registry">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingPlayer) deletePlayerMutation.mutate(deletingPlayer.id); }}
              disabled={deletePlayerMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete-registry"
            >
              {deletePlayerMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MarketplaceUsersTabContent() {
  return <MarketplaceUsersSubTab />;
}

function MarketplaceUsersSubTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);

  const { data: users, isLoading } = useQuery<MarketplaceUserWithLinkedPlayer[]>({
    queryKey: ['/api/marketplace/admin/users'],
    queryFn: async () => {
      const res = await fetch('/api/marketplace/admin/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const searchPlayers = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/marketplace/admin/search-players?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      const results: PlayerSearchResult[] = await res.json();
      setSearchResults(results);
    }
  };

  const linkMutation = useMutation({
    mutationFn: async ({ marketplaceUserId, playerId }: { marketplaceUserId: string; playerId: number }) => {
      const res = await fetch('/api/marketplace/admin/link-player', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ marketplaceUserId, playerId }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Player linked' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/users'] });
      setLinkingUser(null);
      setSearchQuery('');
      setSearchResults([]);
    },
    onError: () => {
      toast({ title: 'Failed to link player', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Marketplace Users</h2>
        <Badge variant="outline">{users?.length || 0} users</Badge>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : !users?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No marketplace users yet. Users will appear here after signing up on the marketplace.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <Card key={user.id} data-testid={`card-admin-user-${user.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}{user.phone ? ` | ${user.phone}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.linkedPlayer ? (
                      <Badge variant="secondary" className="text-xs">
                        Linked: {user.linkedPlayer.name} ({user.linkedPlayer.shuttleIqId})
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-xs">Not Linked</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setLinkingUser(user.id); setSearchQuery(''); setSearchResults([]); }}
                          data-testid={`button-link-player-${user.id}`}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {linkingUser === user.id && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Search by name, ID, or email..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); searchPlayers(e.target.value); }}
                        data-testid="input-search-player-link"
                      />
                      <Button variant="ghost" size="sm" onClick={() => setLinkingUser(null)} data-testid="button-cancel-link">Cancel</Button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="space-y-1">
                        {searchResults.map((player) => (
                          <div key={player.id} className="flex items-center justify-between p-2 rounded-md hover-elevate">
                            <div>
                              <span className="font-medium text-sm">{player.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{player.shuttleIqId} - {player.level}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => linkMutation.mutate({ marketplaceUserId: user.id, playerId: player.id })}
                              disabled={linkMutation.isPending}
                              data-testid={`button-confirm-link-${player.id}`}
                            >
                              Link
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
