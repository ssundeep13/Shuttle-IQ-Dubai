import { useState } from 'react';
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
import { LogOut, Calendar, MapPin, Plus, Trash2, Eye, Users } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { SessionSetupWizard } from '@/components/SessionSetupWizard';
import type { Session } from '@shared/schema';

export default function SessionsManagement() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['/api/sessions'],
  });

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
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ShuttleIQ - Sessions</h1>
            <p className="text-sm text-muted-foreground">
              Logged in as {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin')}
              data-testid="button-admin-dashboard"
            >
              <Users className="w-4 h-4 mr-2" />
              Admin Tools
            </Button>
            <Button 
              variant="ghost" 
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">Manage Sessions</h2>
            <p className="text-muted-foreground mt-1">
              Create, view, and manage badminton sessions across venues
            </p>
          </div>
          <Button 
            onClick={() => setShowCreateSession(true)}
            data-testid="button-create-session"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Session
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading sessions...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Sessions */}
            <div>
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                Active Sessions
                <Badge variant="default">{activeSessions.length}</Badge>
              </h3>
              {activeSessions.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No active sessions
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
              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  Upcoming Sessions
                  <Badge variant="secondary">{upcomingSessions.length}</Badge>
                </h3>
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
              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  Ended Sessions
                  <Badge variant="outline">{endedSessions.length}</Badge>
                </h3>
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
            <SessionSetupWizard onSessionCreated={handleSessionCreated} />
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

  return (
    <Card className="hover-elevate" data-testid={`session-card-${session.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{session.venueName}</CardTitle>
            <CardDescription className="mt-1">
              <div className="flex items-center gap-1 text-sm">
                <Calendar className="w-3 h-3" />
                {format(new Date(session.date), 'PPP')}
              </div>
              {session.venueLocation && (
                <div className="flex items-center gap-1 text-sm mt-1">
                  <MapPin className="w-3 h-3" />
                  {session.venueLocation}
                </div>
              )}
            </CardDescription>
          </div>
          <Badge variant={getStatusBadgeVariant(session.status)}>
            {session.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {session.courtCount} courts
          </span>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline"
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
        </div>
      </CardContent>
    </Card>
  );
}
