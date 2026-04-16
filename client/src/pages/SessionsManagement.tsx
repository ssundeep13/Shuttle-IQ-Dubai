import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTierDisplayName } from '@shared/utils/skillUtils';
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
import { LogOut, Calendar, MapPin, Plus, Trash2, Eye, Users, Activity, Clock, CheckCircle, LayoutGrid, Trophy, FileDown, Search, Link2, ShoppingBag, DollarSign, Pencil, Play, Banknote, CreditCard, Flag, CheckCircle2, XCircle, ReceiptText, ExternalLink, Copy, AlertTriangle, FlaskConical, TrendingUp, Lightbulb, ThumbsUp, X, Check, Upload, ImageIcon, Loader2, Gift, Package } from 'lucide-react';
import FinanceTab from '@/components/FinanceTab';
import { queryClient as qc, apiRequest } from '@/lib/queryClient';
import { SessionSetupWizard } from '@/components/SessionSetupWizard';
import { PlayerImport } from '@/components/PlayerImport';
import { GameHistoryExport } from '@/components/GameHistoryExport';
import { Leaderboard } from '@/components/Leaderboard';
import { EditPlayerModal } from '@/components/EditPlayerModal';
import { EditSessionModal } from '@/components/EditSessionModal';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Session, Player, BookableSessionWithAvailability, BookingWithDetails, MarketplaceUser, ScoreDisputeWithDetails, BookingGuest, BookingGuestWithLinked, RefundNotificationWithDetails, TagSuggestionWithVote } from '@shared/schema';
import { UserCheck, FileText } from 'lucide-react';
import BlogEditor from '@/components/BlogEditor';
import type { BlogPost } from '@shared/schema';

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
  const [sandboxToDelete, setSandboxToDelete] = useState<Session | null>(null);
  const [sessionToActivate, setSessionToActivate] = useState<Session | null>(null);
  const [bookingsSession, setBookingsSession] = useState<Session | null>(null);
  const [editingSession, setEditingSession] = useState<Session | null>(null);

  const { data: allSessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['/api/sessions'],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: sandboxSessions = [] } = useQuery<Session[]>({
    queryKey: ['/api/sessions', 'sandbox'],
    queryFn: () => apiRequest('GET', '/api/sessions?sandbox=true'),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const { data: bookableSessions = [] } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/admin/sessions'],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: disputes = [] } = useQuery<ScoreDisputeWithDetails[]>({
    queryKey: ['/api/disputes'],
    refetchOnMount: 'always',
  });

  const { data: refunds = [] } = useQuery<RefundNotificationWithDetails[]>({
    queryKey: ['/api/marketplace/admin/refunds'],
    refetchOnMount: 'always',
  });

  const openDisputeCount = disputes.filter(d => d.status === 'open').length;
  const pendingRefundCount = refunds.filter(r => !r.read).length;

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
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      setSessionToDelete(null);
    },
  });

  const deleteSandboxMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('POST', `/api/sessions/${id}/end`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', 'sandbox'] });
      setSandboxToDelete(null);
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
    queryClient.invalidateQueries({ queryKey: ['/api/sessions', 'sandbox'] });
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/sessions'] });
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
              <TabsTrigger value="disputes" data-testid="tab-disputes" className="flex items-center gap-2">
                <Flag className="w-4 h-4" />
                Disputes
                {openDisputeCount > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-amber-500 text-white border-0 no-default-hover-elevate no-default-active-elevate">
                    {openDisputeCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="refunds" data-testid="tab-refunds" className="flex items-center gap-2">
                <ReceiptText className="w-4 h-4" />
                Refunds
                {pendingRefundCount > 0 && (
                  <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-destructive text-destructive-foreground border-0 no-default-hover-elevate no-default-active-elevate">
                    {pendingRefundCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="finance" data-testid="tab-finance" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Finance
              </TabsTrigger>
              <TabsTrigger value="tag-suggestions" data-testid="tab-tag-suggestions" className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Tag Ideas
              </TabsTrigger>
              <TabsTrigger value="blog" data-testid="tab-blog" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Blog
              </TabsTrigger>
              <TabsTrigger value="referrals" data-testid="tab-referrals" className="flex items-center gap-2">
                <Gift className="w-4 h-4" />
                Referrals
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
              sandboxSessions={sandboxSessions}
              bookableSessions={bookableSessions}
              isLoading={isLoading}
              onView={(session) => navigate(`/session/${session.id}`)}
              onDelete={(session) => setSessionToDelete(session)}
              onDeleteSandbox={(session) => setSandboxToDelete(session)}
              onViewBookings={(session) => setBookingsSession(session)}
              onActivate={(session) => setSessionToActivate(session)}
              onEdit={(session) => setEditingSession(session)}
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

          <TabsContent value="disputes" className="mt-6">
            <DisputesTabContent disputes={disputes} />
          </TabsContent>

          <TabsContent value="refunds" className="mt-6">
            <RefundsTabContent refunds={refunds} />
          </TabsContent>

          <TabsContent value="finance" className="mt-6">
            <FinanceTab />
          </TabsContent>

          <TabsContent value="tag-suggestions" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Community Tag Suggestions</CardTitle>
                <CardDescription>
                  Review player-submitted tag ideas. Approve tags to add them to the catalog, or reject with an optional note.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TagSuggestionsPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blog" className="mt-6">
            <BlogPanel />
          </TabsContent>

          <TabsContent value="referrals" className="mt-6">
            <ReferralsTabContent />
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

      <AlertDialog open={!!sandboxToDelete} onOpenChange={(open) => !open && setSandboxToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Sandbox Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This sandbox session and all its data will be permanently deleted. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-sandbox">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sandboxToDelete && deleteSandboxMutation.mutate(sandboxToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete-sandbox"
            >
              Delete Sandbox
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!sessionToActivate} onOpenChange={(open) => !open && setSessionToActivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Session?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to activate "{sessionToActivate?.venueName}"?
              This will open the queue and make it the live session for court management.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-activate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (sessionToActivate) {
                  await handleActivateSession(sessionToActivate);
                  setSessionToActivate(null);
                }
              }}
              data-testid="button-confirm-activate"
            >
              Activate Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingsSheet 
        session={bookingsSession} 
        onClose={() => setBookingsSession(null)} 
      />

      <EditSessionModal
        open={!!editingSession}
        onClose={() => setEditingSession(null)}
        session={editingSession}
        linkedBookable={editingSession ? bookableSessions.find(bs => bs.linkedSessionId === editingSession.id) || null : null}
      />
    </div>
  );
}

function SessionsTabContent({ 
  sessions, activeSessions, upcomingSessions, endedSessions, sandboxSessions, bookableSessions,
  isLoading, onView, onDelete, onDeleteSandbox, onViewBookings, onActivate, onEdit, totalBookings, totalRevenue
}: { 
  sessions: Session[];
  activeSessions: Session[];
  upcomingSessions: Session[];
  endedSessions: Session[];
  sandboxSessions: Session[];
  bookableSessions: BookableSessionWithAvailability[];
  isLoading: boolean;
  onView: (session: Session) => void;
  onDelete: (session: Session) => void;
  onDeleteSandbox: (session: Session) => void;
  onViewBookings: (session: Session) => void;
  onActivate: (session: Session) => void;
  onEdit: (session: Session) => void;
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
            onEdit={onEdit}
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
              onEdit={onEdit}
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
              onEdit={onEdit}
              getLinkedBookableSession={getLinkedBookableSession}
            />
          )}

          {sandboxSessions.length > 0 && (
            <SessionSection
              title="Sandbox Sessions"
              icon={<FlaskConical className="w-5 h-5 text-amber-600" />}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              sessions={sandboxSessions}
              badge={<Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 no-default-hover-elevate no-default-active-elevate" data-testid="badge-sandbox-count">{sandboxSessions.length}</Badge>}
              onView={onView}
              onDelete={onDeleteSandbox}
              onViewBookings={onViewBookings}
              onActivate={onActivate}
              onEdit={onEdit}
              getLinkedBookableSession={getLinkedBookableSession}
              isSandbox
            />
          )}
        </div>
      )}
    </>
  );
}

function SessionSection({ 
  title, icon, iconBg, sessions, badge, emptyMessage, emptySubMessage,
  onView, onDelete, onViewBookings, onActivate, onEdit, getLinkedBookableSession, isSandbox
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
  onEdit: (session: Session) => void;
  getLinkedBookableSession: (sessionId: string) => BookableSessionWithAvailability | undefined;
  isSandbox?: boolean;
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
              onEdit={() => onEdit(session)}
              isSandbox={isSandbox}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ 
  session, linkedBookable, onView, onDelete, onViewBookings, onActivate, onEdit, isSandbox
}: { 
  session: Session;
  linkedBookable?: BookableSessionWithAvailability;
  onView: () => void; 
  onDelete: () => void;
  onViewBookings: () => void;
  onActivate?: () => void;
  onEdit?: () => void;
  isSandbox?: boolean;
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
              {isSandbox && (
                <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 gap-1 no-default-hover-elevate no-default-active-elevate">
                  <FlaskConical className="h-3 w-3" />
                  Sandbox
                </Badge>
              )}
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
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="truncate">{session.venueLocation}</span>
            </div>
          )}
          {session.venueMapUrl && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0 text-primary" />
              <a
                href={session.venueMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate text-sm"
                data-testid={`link-session-map-${session.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                View on Google Maps
              </a>
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
          {(session.status === 'draft' || session.status === 'upcoming') && onActivate && (() => {
            const sessionDate = new Date(session.date);
            const today = new Date();
            const sessionDateOnly = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
            const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const isFuture = !session.isSandbox && sessionDateOnly > todayDateOnly;
            const formattedDate = format(sessionDate, 'PPP');
            return isFuture ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      disabled
                      data-testid={`button-activate-${session.id}`}
                      style={{ pointerEvents: 'none' }}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Activate
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Available to activate on {formattedDate}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button 
                size="sm" 
                variant="outline"
                onClick={onActivate}
                data-testid={`button-activate-${session.id}`}
              >
                <Play className="w-4 h-4 mr-1" />
                Activate
              </Button>
            );
          })()}
          {(session.status === 'draft' || session.status === 'upcoming') && onEdit && (
            <Button 
              size="sm" 
              variant="ghost"
              onClick={onEdit}
              data-testid={`button-edit-${session.id}`}
            >
              <Pencil className="w-4 h-4" />
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
    queryKey: ['/api/marketplace/admin/sessions'],
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

  const adminConfirmMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/admin-confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Booking confirmed',
        description: data.ziinaStatus ? `Ziina status was: ${data.ziinaStatus}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', linkedBookable?.id, 'bookings'] });
    },
    onError: () => toast({ title: 'Failed to confirm booking', variant: 'destructive' }),
  });

  const adminPromoteMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/admin-promote`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json();
      if (!res.ok) throw data;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Booking confirmed' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', linkedBookable?.id, 'bookings'] });
    },
    onError: (err: unknown) => {
      const isSessionFull = typeof err === 'object' && err !== null && (err as { error?: string }).error === 'session_full';
      const msg = isSessionFull ? 'Session is still full' : 'Failed to confirm spot';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const { data: allPlayers = [] } = useQuery<Player[]>({ queryKey: ['/api/players'] });
  const playerSiqMap = Object.fromEntries(
    allPlayers.filter(p => p.shuttleIqId).map(p => [p.id, p.shuttleIqId!])
  );

  const sessionRevenue = bookings?.filter(b => b.status === 'confirmed' || b.status === 'attended').reduce((sum, b) => sum + b.amountAed, 0) || 0;

  const activeBookings = bookings?.filter(b => b.status === 'confirmed' || b.status === 'attended') || [];
  const pendingBookings = bookings?.filter(b => b.status === 'pending') || [];
  const waitlistedBookings = bookings?.filter(b => b.status === 'waitlisted') || [];
  const cancelledBookings = bookings?.filter(b => b.status === 'cancelled') || [];

  const copyForWhatsApp = () => {
    if (!linkedBookable) return;
    const dateStr = linkedBookable.date ? format(new Date(linkedBookable.date), 'EEE d MMM yyyy') : '';
    const lines: string[] = [];

    // Helper to get SIQ label for any participant (primary or guest)
    const guestSiqPart = (g: BookingGuestWithLinked) => {
      const siq = g.linkedPlayerId ? playerSiqMap[g.linkedPlayerId] : null;
      return siq ? ` (${siq})` : '';
    };

    const fullyConfirmedBookings = activeBookings; // status confirmed/attended

    // Count total active slots (primary + non-cancelled non-primary guests across active bookings)
    const confirmedSlots = fullyConfirmedBookings.reduce((sum, b) => {
      const activeGuestCount = (b.guests || []).filter((g: BookingGuestWithLinked) => !g.isPrimary && g.status !== 'cancelled').length;
      return sum + 1 + activeGuestCount;
    }, 0);

    lines.push(`*${linkedBookable.title} — ${dateStr}*`);
    lines.push(`✅ Confirmed: ${confirmedSlots}`);

    let lineNum = 1;
    fullyConfirmedBookings.forEach((b) => {
      const name = b.user?.name || 'Unknown';
      const siq = b.user?.linkedPlayerId ? playerSiqMap[b.user.linkedPlayerId] : null;
      const siqPart = siq ? ` (${siq})` : '';
      const status = b.status === 'attended' ? '✓ Attended' : '✓ Confirmed';
      lines.push(`${lineNum}. ${name}${siqPart} ${status}`);
      lineNum++;

      // Sub-lines for non-primary, non-cancelled guests — do NOT increment lineNum
      const activeGuests = (b.guests || []).filter((g: BookingGuestWithLinked) => !g.isPrimary && g.status !== 'cancelled');
      activeGuests.forEach((g: BookingGuestWithLinked) => {
        lines.push(`   └ ${g.name}${guestSiqPart(g)} (guest)`);
      });
    });

    // ⏳ Waitlisted section
    if (waitlistedBookings.length > 0) {
      const waitlistedSlots = waitlistedBookings.reduce((sum, b) => {
        const activeGuestCount = (b.guests || []).filter((g: BookingGuestWithLinked) => !g.isPrimary && g.status !== 'cancelled').length;
        return sum + 1 + activeGuestCount;
      }, 0);

      lines.push('');
      lines.push(`⏳ Waitlisted: ${waitlistedSlots}`);
      let wNum = 1;

      waitlistedBookings.forEach((b) => {
        const name = b.user?.name || 'Unknown';
        const siq = b.user?.linkedPlayerId ? playerSiqMap[b.user.linkedPlayerId] : null;
        const siqPart = siq ? ` (${siq})` : '';
        lines.push(`${wNum}. ${name}${siqPart} ⏳ Waitlisted`);
        wNum++;

        const activeGuests = (b.guests || []).filter((g: BookingGuestWithLinked) => !g.isPrimary && g.status !== 'cancelled');
        activeGuests.forEach((g: BookingGuestWithLinked) => {
          lines.push(`   └ ${g.name}${guestSiqPart(g)} (guest)`);
        });
      });
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast({ title: 'Copied', description: 'Booking list copied to clipboard' });
    }).catch(() => {
      toast({ title: 'Copy failed', description: 'Could not access clipboard', variant: 'destructive' });
    });
  };

  const BookingRow = ({ booking }: { booking: BookingWithDetails }) => (
    <Card key={booking.id} data-testid={`card-sheet-booking-${booking.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="font-medium text-sm">{booking.user?.name || 'Unknown'}</div>
            <div className="text-xs text-muted-foreground">{booking.user?.email}</div>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium">AED {booking.amountAed}</span>
            {booking.spotsBooked > 1 && (
              <div className="text-xs text-muted-foreground">{booking.spotsBooked} spots</div>
            )}
          </div>
        </div>
        {booking.guests && booking.guests.filter((g: BookingGuest) => !g.isPrimary).length > 0 && (
          <div className="text-xs space-y-0.5 pl-1">
            {booking.guests.filter((g: BookingGuest) => !g.isPrimary).map((guest: BookingGuest) => (
              <div
                key={guest.id}
                className={`flex items-center gap-1.5 ${guest.status === 'cancelled' ? 'opacity-50 line-through' : 'text-muted-foreground'}`}
                data-testid={`text-admin-guest-${guest.id}`}
              >
                <UserCheck className={`h-3 w-3 shrink-0 ${guest.linkedUserId ? 'text-secondary' : 'text-muted-foreground'}`} />
                <span>{guest.name}</span>
                {guest.linkedUserId && guest.status !== 'cancelled' && (
                  <Badge variant="secondary" className="text-xs h-4 px-1" data-testid={`badge-admin-guest-linked-${guest.id}`}>
                    linked
                  </Badge>
                )}
                {guest.status === 'cancelled' && (
                  <Badge variant="destructive" className="text-xs h-4 px-1">
                    cancelled
                  </Badge>
                )}
                {guest.email && !guest.linkedUserId && guest.status !== 'cancelled' && (
                  <span className="text-muted-foreground/60 truncate max-w-[100px]">{guest.email}</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={booking.paymentMethod === 'cash' ? 'secondary' : 'outline'}
            data-testid={`badge-method-${booking.id}`}
          >
            {booking.paymentMethod === 'cash' ? (
              <><Banknote className="h-3 w-3 mr-1" /> Cash</>
            ) : (
              <><CreditCard className="h-3 w-3 mr-1" /> Ziina</>
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
          {booking.lateFeeApplied && (
            <Badge variant="destructive" className="gap-1 text-xs" data-testid={`badge-latefee-${booking.id}`}>
              Late Fee
            </Badge>
          )}
        </div>
        {booking.createdAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`text-booking-time-${booking.id}`}>
            <Clock className="h-3 w-3 shrink-0" />
            <span>Booked {format(new Date(booking.createdAt), 'MMM d, h:mm a')}</span>
          </div>
        )}
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
          {booking.paymentMethod !== 'cash' && booking.status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400"
              onClick={() => adminConfirmMutation.mutate(booking.id)}
              disabled={adminConfirmMutation.isPending}
              data-testid={`button-admin-confirm-${booking.id}`}
            >
              <CheckCircle className="h-3 w-3" />
              Confirm Payment
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
  );

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
              <div className="flex items-center gap-2">
                <span data-testid="text-sheet-revenue">AED {sessionRevenue}</span>
                <Badge variant="outline">{bookings?.filter(b => b.status === 'attended').length || 0} attended</Badge>
                {bookings && bookings.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={copyForWhatsApp}
                    data-testid="button-copy-whatsapp"
                  >
                    <Copy className="h-3 w-3" />
                    Copy for WhatsApp
                  </Button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
            ) : !bookings?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No bookings yet</div>
            ) : (
              <div className="space-y-5">
                {activeBookings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Confirmed / Attended
                      </p>
                      <Badge variant="secondary" className="text-xs">{activeBookings.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {activeBookings.map(b => <BookingRow key={b.id} booking={b} />)}
                    </div>
                  </div>
                )}

                {pendingBookings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Pending Payment
                      </p>
                      <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400">{pendingBookings.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {pendingBookings.map(b => <BookingRow key={b.id} booking={b} />)}
                    </div>
                  </div>
                )}

                {waitlistedBookings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Waitlist
                      </p>
                      <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">{waitlistedBookings.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {waitlistedBookings.map(b => (
                        <Card key={b.id} data-testid={`card-sheet-waitlist-${b.id}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="min-w-0">
                                <div className="font-medium text-sm">{b.user?.name || 'Unknown'}</div>
                                <div className="text-xs text-muted-foreground">{b.user?.email}</div>
                              </div>
                              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 shrink-0" data-testid={`badge-waitlist-pos-${b.id}`}>
                                #{b.waitlistPosition}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                              <p className="text-xs text-muted-foreground">No payment — waiting for a spot to open</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 border-green-500/40 text-green-700 dark:text-green-400"
                                onClick={() => adminPromoteMutation.mutate(b.id)}
                                disabled={adminPromoteMutation.isPending}
                                data-testid={`button-promote-waitlist-${b.id}`}
                              >
                                <CheckCircle className="h-3 w-3" /> Confirm Spot
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {cancelledBookings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-destructive/70">
                        Cancelled
                      </p>
                      <Badge variant="destructive" className="text-xs opacity-70">{cancelledBookings.length}</Badge>
                    </div>
                    <div className="space-y-2 opacity-70">
                      {cancelledBookings.map(b => <BookingRow key={b.id} booking={b} />)}
                    </div>
                  </div>
                )}
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

function LastActiveIndicator({ lastPlayedAt }: { lastPlayedAt: Date | string | null }) {
  if (!lastPlayedAt) {
    return <span className="text-muted-foreground/60 text-xs">never played</span>;
  }
  const date = new Date(lastPlayedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const isInactive = diffDays >= 14;

  let label: string;
  if (diffDays === 0) {
    label = 'today';
  } else if (diffDays === 1) {
    label = '1d ago';
  } else if (diffDays < 14) {
    label = `${diffDays}d ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    label = `${weeks}w ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    label = `${months}mo ago`;
  }

  if (isInactive) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" data-testid="last-active-indicator-inactive">
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
        {label}
      </span>
    );
  }

  return <span className="text-xs text-muted-foreground" data-testid="last-active-indicator">{label}</span>;
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
                      <span>{getTierDisplayName(player.level)}</span>
                      <span>{player.gamesPlayed} games</span>
                      <span>{player.wins} wins</span>
                      <LastActiveIndicator lastPlayedAt={player.lastPlayedAt ?? null} />
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
                              <span className="text-xs text-muted-foreground ml-2">{player.shuttleIqId} - {getTierDisplayName(player.level)}</span>
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

function DisputesTabContent({ disputes }: { disputes: ScoreDisputeWithDetails[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resolvingDispute, setResolvingDispute] = useState<ScoreDisputeWithDetails | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [pendingStatus, setPendingStatus] = useState<'resolved' | 'dismissed'>('dismissed');
  const [editingScore, setEditingScore] = useState<ScoreDisputeWithDetails | null>(null);
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: string; status: 'resolved' | 'dismissed'; adminNote: string }) =>
      apiRequest('PATCH', `/api/disputes/${id}`, { status, adminNote: adminNote.trim() || undefined }),
    onSuccess: () => {
      toast({ title: pendingStatus === 'resolved' ? 'Dispute Resolved' : 'Dispute Dismissed', description: 'The player has been notified by email.' });
      setResolvingDispute(null);
      setAdminNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/disputes'] });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update dispute', variant: 'destructive' }),
  });

  const editScoreMutation = useMutation({
    mutationFn: async ({ gameResultId, t1, t2 }: { gameResultId: string; t1: number; t2: number }) =>
      apiRequest('PATCH', `/api/game-results/${gameResultId}`, { team1Score: t1, team2Score: t2 }),
    onSuccess: () => {
      toast({ title: 'Score Updated', description: 'Now mark the dispute as resolved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/game-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      const dispute = editingScore;
      setEditingScore(null);
      if (dispute) {
        setPendingStatus('resolved');
        setAdminNote('Score has been corrected as requested.');
        setResolvingDispute(dispute);
      }
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update score', variant: 'destructive' }),
  });

  const openDisputes = disputes.filter(d => d.status === 'open');
  const closedDisputes = disputes.filter(d => d.status !== 'open');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Flag className="h-4 w-4 text-amber-500" />
          Open Disputes
          {openDisputes.length > 0 && (
            <Badge className="bg-amber-500 text-white border-0 no-default-hover-elevate no-default-active-elevate">
              {openDisputes.length}
            </Badge>
          )}
        </h3>
        {openDisputes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
              <p className="font-medium">No open disputes</p>
              <p className="text-sm mt-1">All score disputes have been resolved.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {openDisputes.map(d => (
              <Card key={d.id} data-testid={`card-dispute-${d.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" data-testid={`text-dispute-player-${d.id}`}>{d.filedByName}</span>
                        <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">{d.filedByEmail}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <span>Score: <strong className="text-foreground">{d.gameScore}</strong></span>
                        <span>&middot;</span>
                        <span>{format(new Date(d.gameDate), 'MMM d, yyyy')}</span>
                      </div>
                      {d.note && (
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2 mt-2" data-testid={`text-dispute-note-${d.id}`}>
                          "{d.note}"
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const parts = d.gameScore.split(' - ');
                          setTeam1Score(parseInt(parts[0]) || 0);
                          setTeam2Score(parseInt(parts[1]) || 0);
                          setEditingScore(d);
                        }}
                        data-testid={`button-edit-score-${d.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit Score
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setPendingStatus('dismissed'); setAdminNote(''); setResolvingDispute(d); }}
                        data-testid={`button-dismiss-${d.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {closedDisputes.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3 text-muted-foreground">Resolved / Dismissed</h3>
          <div className="space-y-2">
            {closedDisputes.map(d => (
              <Card key={d.id} className="opacity-60" data-testid={`card-dispute-closed-${d.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="font-medium text-sm">{d.filedByName}</span>
                      <div className="text-xs text-muted-foreground">
                        Score: {d.gameScore} &middot; {format(new Date(d.gameDate), 'MMM d, yyyy')}
                        {d.adminNote && <span> &middot; "{d.adminNote}"</span>}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs no-default-hover-elevate no-default-active-elevate ${d.status === 'resolved' ? 'text-green-600 border-green-500/30' : 'text-muted-foreground'}`}
                    >
                      {d.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Edit Score Dialog */}
      <Dialog open={!!editingScore} onOpenChange={(open) => { if (!open) setEditingScore(null); }}>
        <DialogContent data-testid="dialog-edit-dispute-score">
          <DialogHeader>
            <DialogTitle>Edit Game Score</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Team 1 Score</label>
              <Input type="number" min={0} value={team1Score} onChange={(e) => setTeam1Score(Number(e.target.value))} data-testid="input-dispute-team1-score" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Team 2 Score</label>
              <Input type="number" min={0} value={team2Score} onChange={(e) => setTeam2Score(Number(e.target.value))} data-testid="input-dispute-team2-score" />
            </div>
          </div>
          {team1Score === team2Score && team1Score > 0 && (
            <p className="text-sm text-amber-600">Scores cannot be tied.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingScore(null)}>Cancel</Button>
            <Button
              onClick={() => { if (editingScore) editScoreMutation.mutate({ gameResultId: editingScore.gameResultId, t1: team1Score, t2: team2Score }); }}
              disabled={editScoreMutation.isPending || team1Score === team2Score}
              data-testid="button-dispute-save-score"
            >
              {editScoreMutation.isPending ? 'Saving...' : 'Save & Resolve Dispute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve / Dismiss confirmation Dialog */}
      <Dialog open={!!resolvingDispute} onOpenChange={(open) => { if (!open) setResolvingDispute(null); }}>
        <DialogContent data-testid="dialog-resolve-dispute">
          <DialogHeader>
            <DialogTitle>{pendingStatus === 'resolved' ? 'Resolve Dispute' : 'Dismiss Dispute'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {pendingStatus === 'resolved'
                ? 'Confirm that the score has been corrected. The player will be notified by email.'
                : 'Dismiss this dispute. The original score will remain as recorded. The player will be notified by email.'}
            </p>
            <Textarea
              placeholder="Optional note to the player..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              maxLength={500}
              rows={2}
              data-testid="textarea-admin-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolvingDispute(null)}>Cancel</Button>
            <Button
              onClick={() => { if (resolvingDispute) resolveMutation.mutate({ id: resolvingDispute.id, status: pendingStatus, adminNote }); }}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveMutation.isPending ? 'Saving...' : pendingStatus === 'resolved' ? 'Resolve' : 'Dismiss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RefundsTabContent({ refunds }: { refunds: RefundNotificationWithDetails[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('PATCH', `/api/marketplace/admin/refunds/${id}/resolve`),
    onSuccess: () => {
      toast({ title: 'Marked as resolved', description: 'Refund has been marked as processed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/refunds'] });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to resolve refund', variant: 'destructive' }),
  });

  const pending = refunds.filter(r => !r.read);
  const resolved = refunds.filter(r => r.read);

  const formatDate = (d: Date | string | null) => {
    if (!d) return '—';
    return format(new Date(d), 'dd MMM yyyy');
  };

  const RefundRow = ({ r, showAction }: { r: RefundNotificationWithDetails; showAction: boolean }) => (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-md border ${showAction ? 'bg-card' : 'bg-muted/30 opacity-70'}`}
      data-testid={`refund-row-${r.id}`}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm" data-testid={`text-refund-player-${r.id}`}>
            {r.playerName ?? 'Unknown player'}
          </span>
          {r.playerEmail && (
            <span className="text-xs text-muted-foreground">{r.playerEmail}</span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {r.sessionTitle ?? 'Unknown session'}
          {r.sessionDate && <span> · {formatDate(r.sessionDate)}</span>}
          {r.sessionVenueName && <span> · {r.sessionVenueName}</span>}
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-3 pt-0.5">
          {r.amountAed != null && (
            <span className="font-medium text-foreground">AED {r.amountAed.toFixed(2)}</span>
          )}
          {r.spotsBooked != null && r.spotsBooked > 1 && (
            <span>{r.spotsBooked} spots</span>
          )}
          <span>Flagged {formatDate(r.createdAt)}</span>
          {r.relatedBookingId && (
            <span className="font-mono">#{r.relatedBookingId.slice(-8)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          asChild
          data-testid={`button-ziina-dashboard-${r.id}`}
        >
          <a href="https://app.ziina.com" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Ziina Dashboard
          </a>
        </Button>
        {showAction && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => resolveMutation.mutate(r.id)}
            disabled={resolveMutation.isPending}
            data-testid={`button-resolve-refund-${r.id}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Mark Resolved
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-destructive" />
          Pending Refunds
          {pending.length > 0 && (
            <Badge className="bg-destructive text-destructive-foreground border-0 no-default-hover-elevate no-default-active-elevate">
              {pending.length}
            </Badge>
          )}
        </h3>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
              <p className="font-medium">No pending refunds</p>
              <p className="text-sm mt-1">All Ziina refunds have been processed.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map(r => (
              <RefundRow key={r.id} r={r} showAction={true} />
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Resolved
          </h3>
          <div className="space-y-2">
            {resolved.map(r => (
              <RefundRow key={r.id} r={r} showAction={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const SUGGESTION_CATEGORY_COLOR: Record<string, string> = {
  playing_style: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  social: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-800',
  reputation: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};
const SUGGESTION_CATEGORY_LABEL: Record<string, string> = {
  playing_style: 'Playing Style',
  social: 'Social',
  reputation: 'Reputation',
};

function TagSuggestionsPanel() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: suggestions = [], isLoading } = useQuery<TagSuggestionWithVote[]>({
    queryKey: ['/api/admin/tags/suggestions', statusFilter],
    queryFn: () =>
      apiRequest<TagSuggestionWithVote[]>('GET', `/api/admin/tags/suggestions?status=${statusFilter}`),
    staleTime: 0,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiRequest('POST', `/api/admin/tags/suggestions/${id}/approve`, { adminNote: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/admin/tags/suggestions'] });
      toast({ title: 'Suggestion approved' });
    },
    onError: () => toast({ title: 'Failed to approve', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      apiRequest('POST', `/api/admin/tags/suggestions/${id}/reject`, { adminNote: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/admin/tags/suggestions'] });
      toast({ title: 'Suggestion rejected' });
    },
    onError: () => toast({ title: 'Failed to reject', variant: 'destructive' }),
  });

  const pendingCount = statusFilter === 'pending' ? suggestions.length : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
            data-testid={`button-filter-${s}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount !== undefined && pendingCount > 0 && (
              <Badge className="ml-1.5 no-default-hover-elevate no-default-active-elevate">{pendingCount}</Badge>
            )}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Loading...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No {statusFilter} suggestions.</p>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => (
            <div key={s.id} className="border rounded-md p-4 space-y-3" data-testid={`card-suggestion-${s.id}`}>
              <div className="flex items-start gap-3">
                <div className="text-2xl shrink-0">{s.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{s.label}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs no-default-hover-elevate no-default-active-elevate ${SUGGESTION_CATEGORY_COLOR[s.category] ?? ''}`}
                    >
                      {SUGGESTION_CATEGORY_LABEL[s.category] ?? s.category}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ThumbsUp className="h-3 w-3" /> {s.voteCount}
                    </span>
                  </div>
                  {s.reason && <p className="text-sm text-muted-foreground mt-1">{s.reason}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggested by {s.suggestedByPlayerName} &middot; {format(new Date(s.createdAt), 'dd MMM yyyy')}
                  </p>
                  {s.adminNote && (
                    <p className="text-xs text-muted-foreground mt-1 italic">Admin note: {s.adminNote}</p>
                  )}
                </div>
              </div>

              {statusFilter === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Input
                    placeholder="Optional admin note..."
                    value={notes[s.id] ?? ''}
                    onChange={e => setNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                    className="flex-1 h-8 text-sm min-w-40"
                    data-testid={`input-admin-note-${s.id}`}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate({ id: s.id, note: notes[s.id] })}
                    data-testid={`button-approve-${s.id}`}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate({ id: s.id, note: notes[s.id] })}
                    data-testid={`button-reject-${s.id}`}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

interface AdminReferral {
  id: string;
  referrerId: string;
  refereeUserId: string;
  refereePlayerId: string | null;
  status: string;
  completedAt: string | null;
  createdAt: string;
  referrerName: string;
  refereeEmail: string;
  referralCode: string | null;
  ambassadorStatus: boolean;
  jerseyDispatched: boolean;
}

function ReferralsTabContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: referrals = [], isLoading } = useQuery<AdminReferral[]>({
    queryKey: ['/api/referrals/all'],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const jerseyMutation = useMutation({
    mutationFn: async (referralId: string) => apiRequest('PATCH', `/api/referrals/${referralId}/jersey-dispatched`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/referrals/all'] });
      toast({ title: 'Jersey marked as dispatched' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to mark jersey dispatched';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    },
  });

  const totalReferrals = referrals.length;
  const completedReferrals = referrals.filter(r => r.status === 'completed').length;
  const creditsPaidAed = completedReferrals * 15;
  const ambassadorReferrers = new Map<string, AdminReferral>();
  referrals.forEach(r => {
    if (r.ambassadorStatus && !ambassadorReferrers.has(r.referrerId)) {
      ambassadorReferrers.set(r.referrerId, r);
    }
  });
  const jerseyEligible = Array.from(ambassadorReferrers.values());
  const jerseyPending = jerseyEligible.filter(r => !r.jerseyDispatched);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="kpi-total-referrals">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Referrals</p>
            <p className="text-2xl font-bold">{totalReferrals}</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-completed-referrals">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold">{completedReferrals}</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-credits-paid">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Credits Paid Out</p>
            <p className="text-2xl font-bold">AED {creditsPaidAed}</p>
          </CardContent>
        </Card>
        <Card data-testid="kpi-jerseys-to-dispatch">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Jerseys to Dispatch</p>
            <p className="text-2xl font-bold">{jerseyPending.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Referrals</CardTitle>
          <CardDescription>{totalReferrals} referral{totalReferrals !== 1 ? 's' : ''} total</CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No referrals yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Referrer</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Referee</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Status</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="py-2 font-medium text-muted-foreground">AED Credited</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((ref, idx) => (
                    <tr
                      key={ref.id}
                      className={idx % 2 === 1 ? 'bg-muted/30' : ''}
                      data-testid={`row-admin-referral-${ref.id}`}
                    >
                      <td className="py-2.5 pr-4">{ref.referrerName}</td>
                      <td className="py-2.5 pr-4">{ref.refereeEmail}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={ref.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs no-default-hover-elevate no-default-active-elevate"
                        >
                          {ref.status === 'completed' ? 'Completed' : 'Pending'}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {ref.createdAt ? format(new Date(ref.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="py-2.5">
                        {ref.status === 'completed' ? 'AED 15' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {jerseyEligible.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              Jersey Fulfilment Queue
            </CardTitle>
            <CardDescription>
              Ambassador players eligible for jersey dispatch
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jerseyEligible.map(ref => (
              <div
                key={ref.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                data-testid={`row-jersey-${ref.id}`}
              >
                <div>
                  <p className="font-medium">{ref.referrerName}</p>
                  <p className="text-xs text-muted-foreground">Code: {ref.referralCode}</p>
                </div>
                {ref.jerseyDispatched ? (
                  <Badge variant="default" className="no-default-hover-elevate no-default-active-elevate" data-testid={`badge-dispatched-${ref.id}`}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Dispatched
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={jerseyMutation.isPending}
                    onClick={() => jerseyMutation.mutate(ref.id)}
                    data-testid={`button-dispatch-jersey-${ref.id}`}
                  >
                    <Package className="h-3.5 w-3.5 mr-1.5" />
                    Mark Dispatched
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BlogPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formFeaturedImage, setFormFeaturedImage] = useState('');
  const [formAuthorName, setFormAuthorName] = useState('ShuttleIQ');
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('draft');
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const { data: posts, isLoading } = useQuery<BlogPost[]>({
    queryKey: ['/api/admin/blog'],
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest('POST', '/api/admin/blog', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/blog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/blog'] });
      toast({ title: 'Post created' });
      resetForm();
    },
    onError: () => {
      toast({ title: 'Failed to create post', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiRequest('PATCH', `/api/admin/blog/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/blog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/blog'] });
      toast({ title: 'Post updated' });
      resetForm();
    },
    onError: () => {
      toast({ title: 'Failed to update post', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/admin/blog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/blog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/blog'] });
      toast({ title: 'Post deleted' });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete post', variant: 'destructive' });
    },
  });

  function resetForm() {
    setEditing(null);
    setCreating(false);
    setFormTitle('');
    setFormSlug('');
    setFormSummary('');
    setFormContent('');
    setFormFeaturedImage('');
    setFormAuthorName('ShuttleIQ');
    setFormStatus('draft');
  }

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const token = localStorage.getItem('accessToken');
      const resp = await fetch('/api/admin/blog/upload-image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Upload failed');
      }
      const { url } = await resp.json();
      setFormFeaturedImage(url);
      toast({ title: 'Image uploaded' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast({ title: message, variant: 'destructive' });
    } finally {
      setImageUploading(false);
    }
  }

  function openEditor(post?: BlogPost) {
    if (post) {
      setEditing(post);
      setCreating(false);
      setFormTitle(post.title);
      setFormSlug(post.slug);
      setFormSummary(post.summary);
      setFormContent(post.content);
      setFormFeaturedImage(post.featuredImage ?? '');
      setFormAuthorName(post.authorName);
      setFormStatus(post.status as 'draft' | 'published');
    } else {
      setEditing(null);
      setCreating(true);
      setFormTitle('');
      setFormSlug('');
      setFormSummary('');
      setFormContent('');
      setFormFeaturedImage('');
      setFormAuthorName('ShuttleIQ');
      setFormStatus('draft');
    }
  }

  function handleSave() {
    const rawSlug = formSlug || slugify(formTitle);
    const slug = rawSlug.replace(/^\/+/, '');
    const payload = {
      title: formTitle,
      slug,
      summary: formSummary,
      content: formContent,
      featuredImage: formFeaturedImage || null,
      authorName: formAuthorName,
      status: formStatus,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const showEditor = creating || editing;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Blog Posts</CardTitle>
            <CardDescription>Create and manage blog posts for the public site.</CardDescription>
          </div>
          {!showEditor && (
            <Button onClick={() => openEditor()} data-testid="button-create-blog-post">
              <Plus className="w-4 h-4 mr-2" />
              New Post
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showEditor ? (
            <div className="space-y-4" data-testid="blog-editor">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={formTitle}
                  onChange={(e) => {
                    setFormTitle(e.target.value);
                    if (!editing) setFormSlug(slugify(e.target.value));
                  }}
                  placeholder="Post title"
                  data-testid="input-blog-title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="url-slug"
                  data-testid="input-blog-slug"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Summary</label>
                <Textarea
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  placeholder="A short summary for previews and SEO..."
                  rows={2}
                  data-testid="input-blog-summary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Content</label>
                <BlogEditor
                  content={formContent}
                  onChange={setFormContent}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Featured Image</label>
                  {formFeaturedImage ? (
                    <div className="relative rounded-md overflow-visible border">
                      <img
                        src={formFeaturedImage}
                        alt="Featured"
                        className="w-full h-32 object-cover rounded-md"
                        data-testid="img-blog-preview"
                      />
                      <div className="absolute top-1 right-1 flex gap-1">
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/jpeg,image/png,image/webp,image/gif';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) handleImageUpload(file);
                            };
                            input.click();
                          }}
                          data-testid="button-blog-replace-image"
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => setFormFeaturedImage('')}
                          data-testid="button-blog-remove-image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover-elevate transition-colors"
                      onClick={() => {
                        if (imageUploading) return;
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/jpeg,image/png,image/webp,image/gif';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) handleImageUpload(file);
                        };
                        input.click();
                      }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) handleImageUpload(file);
                      }}
                      data-testid="dropzone-blog-image"
                    >
                      {imageUploading ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Uploading...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            Click or drag image here
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            JPEG, PNG, WebP, GIF (max 5MB)
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Author</label>
                  <Input
                    value={formAuthorName}
                    onChange={(e) => setFormAuthorName(e.target.value)}
                    placeholder="Author name"
                    data-testid="input-blog-author"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Status:</label>
                  <Button
                    size="sm"
                    variant={formStatus === 'draft' ? 'default' : 'outline'}
                    onClick={() => setFormStatus('draft')}
                    data-testid="button-status-draft"
                  >
                    Draft
                  </Button>
                  <Button
                    size="sm"
                    variant={formStatus === 'published' ? 'default' : 'outline'}
                    onClick={() => setFormStatus('published')}
                    data-testid="button-status-published"
                  >
                    Published
                  </Button>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" onClick={resetForm} data-testid="button-cancel-blog">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!formTitle.trim() || createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-blog"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !posts || posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-blog-posts">
              No blog posts yet. Click "New Post" to create your first one.
            </p>
          ) : (
            <div className="space-y-2">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md border"
                  data-testid={`blog-post-row-${post.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate" data-testid={`text-blog-row-title-${post.id}`}>
                        {post.title}
                      </span>
                      <Badge
                        variant={post.status === 'published' ? 'default' : 'secondary'}
                        className="text-xs no-default-hover-elevate no-default-active-elevate"
                      >
                        {post.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      /{post.slug} &middot; {post.authorName}
                      {post.publishedAt && ` &middot; ${format(new Date(post.publishedAt), 'MMM d, yyyy')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditor(post)}
                      data-testid={`button-edit-blog-${post.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {post.status === 'published' && (
                      <a href={`/marketplace/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                        <Button size="icon" variant="ghost" data-testid={`button-view-blog-${post.id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(post)}
                      data-testid={`button-delete-blog-${post.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete blog post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.title}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-blog">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-blog"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
