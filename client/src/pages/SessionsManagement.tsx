import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { LogOut, Calendar, MapPin, Plus, Trash2, Eye, Users, Activity, Clock, CheckCircle, LayoutGrid } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { SessionSetupWizard } from '@/components/SessionSetupWizard';
import type { Session } from '@shared/schema';

export default function SessionsManagement() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);

  const { data: allSessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['/api/sessions'],
  });

  // Increment wizard key whenever it closes to force fresh mount on next open
  useEffect(() => {
    if (!showCreateSession) {
      setWizardKey(prev => prev + 1);
    }
  }, [showCreateSession]);

  // Filter out draft sessions (they're temporary wizard state)
  const sessions = allSessions.filter(s => s.status !== 'draft');

  const createSessionMutation = useMutation({
    mutationFn: async (data: any) => apiRequest('POST', '/api/sessions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setShowCreateSession(false);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      setSessionToDelete(null);
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSessionCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
    setShowCreateSession(false);
    // Key increment happens in useEffect when showCreateSession becomes false
  };

  const handleDeleteSession = async () => {
    if (sessionToDelete) {
      await deleteSessionMutation.mutateAsync(sessionToDelete.id);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'upcoming':
        return 'secondary';
      case 'ended':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const activeSessions = sessions.filter(s => s.status === 'active');
  const upcomingSessions = sessions.filter(s => s.status === 'upcoming');
  const endedSessions = sessions.filter(s => s.status === 'ended');

  return (
    <div className="min-h-screen bg-background">
      {/* Slim Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">ShuttleIQ</h1>
            <Badge variant="secondary" className="text-xs">
              {user?.email}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/admin')}
              data-testid="button-admin-dashboard"
            >
              <Users className="w-4 h-4 mr-2" />
              Admin Tools
            </Button>
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
        {/* Page Header with Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Manage Sessions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create, view, and manage badminton sessions across venues
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateSession(true)}
            data-testid="button-create-session"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Session
          </Button>
        </div>

        {/* KPI Stats Ribbon */}
        {!isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-card hover-elevate" data-testid="kpi-ended-sessions">
              <div className="p-2 rounded-md bg-muted">
                <CheckCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ended</p>
                <p className="text-2xl font-bold" data-testid="count-ended-sessions">{endedSessions.length}</p>
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
            {/* Active Sessions */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Active Sessions</h3>
                <Badge variant="default" data-testid="badge-active-count">{activeSessions.length}</Badge>
              </div>
              {activeSessions.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Activity className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground">No active sessions</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">
                      Create a new session to get started
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {activeSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onView={() => navigate(`/session/${session.id}`)}
                      onDelete={() => setSessionToDelete(session)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming Sessions */}
            {upcomingSessions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-chart-2/10">
                    <Clock className="w-5 h-5 text-chart-2" />
                  </div>
                  <h3 className="text-lg font-semibold">Upcoming Sessions</h3>
                  <Badge variant="secondary" data-testid="badge-upcoming-count">{upcomingSessions.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {upcomingSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onView={() => navigate(`/session/${session.id}`)}
                      onDelete={() => setSessionToDelete(session)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Ended Sessions */}
            {endedSessions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <CheckCircle className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold">Ended Sessions</h3>
                  <Badge variant="outline" data-testid="badge-ended-count">{endedSessions.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {endedSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onView={() => navigate(`/session/${session.id}`)}
                      onDelete={() => setSessionToDelete(session)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Session Dialog */}
      {showCreateSession && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-background" onClick={() => setShowCreateSession(false)} />
          <div className="relative flex items-center justify-center min-h-screen p-4">
            <SessionSetupWizard 
              key={wizardKey}
              onSessionCreated={handleSessionCreated} 
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
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
    </div>
  );
}

function SessionCard({ 
  session, 
  onView, 
  onDelete 
}: { 
  session: Session; 
  onView: () => void; 
  onDelete: () => void;
}) {
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'upcoming':
        return 'secondary';
      case 'ended':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-primary';
      case 'upcoming':
        return 'text-chart-2';
      case 'ended':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Card className="hover-elevate" data-testid={`session-card-${session.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={getStatusBadgeVariant(session.status)} className="capitalize">
                {session.status}
              </Badge>
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
        </div>
        
        <div className="flex gap-2 pt-2 border-t">
          <Button 
            size="sm" 
            variant="default"
            className="flex-1"
            onClick={onView}
            data-testid={`button-view-${session.id}`}
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
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
