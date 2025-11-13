import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Users, FileDown, Calendar } from 'lucide-react';
import { SessionSetupWizard } from '@/components/SessionSetupWizard';
import { PlayerImport } from '@/components/PlayerImport';
import { GameHistoryExport } from '@/components/GameHistoryExport';
import { useActiveSession } from '@/hooks/use-active-session';

export default function Admin() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { session, hasSession } = useActiveSession();
  const [activeTab, setActiveTab] = useState('session');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ShuttleIQ Admin</h1>
            <p className="text-sm text-muted-foreground">
              Logged in as {user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              data-testid="button-view-dashboard"
            >
              View Dashboard
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 max-w-2xl mx-auto mb-8">
            <TabsTrigger value="session" data-testid="tab-session">
              <Calendar className="w-4 h-4 mr-2" />
              Session
            </TabsTrigger>
            <TabsTrigger value="players" data-testid="tab-players">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">
              <FileDown className="w-4 h-4 mr-2" />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="session" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Session Management</CardTitle>
                <CardDescription>
                  Create and manage your badminton sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hasSession && session ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <h3 className="font-semibold text-lg mb-2" data-testid="text-session-name">
                        {session.venueName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {session.venueLocation}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.courtCount} courts
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Started: {new Date(session.date).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Session is currently active. Use the main dashboard to manage courts and players.
                    </p>
                  </div>
                ) : (
                  <SessionSetupWizard onSessionCreated={() => {}} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="players" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Player Import</CardTitle>
                <CardDescription>
                  Import player data from CSV files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlayerImport />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Game History Export</CardTitle>
                <CardDescription>
                  Download game scores and statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GameHistoryExport />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
