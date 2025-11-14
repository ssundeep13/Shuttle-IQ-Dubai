import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Users, FileDown, FolderKanban } from 'lucide-react';
import { PlayerImport } from '@/components/PlayerImport';
import { GameHistoryExport } from '@/components/GameHistoryExport';

export default function Admin() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState('players');

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
              onClick={() => navigate('/admin/sessions')}
              data-testid="button-sessions"
            >
              <FolderKanban className="w-4 h-4 mr-2" />
              Sessions
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
        <div className="mb-8">
          <h2 className="text-3xl font-bold">Admin Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Manage players and export game data
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md mb-8">
            <TabsTrigger value="players" data-testid="tab-players">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">
              <FileDown className="w-4 h-4 mr-2" />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="space-y-6">
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

          <TabsContent value="export" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Game History Export</CardTitle>
                <CardDescription>
                  Download game scores and statistics from any session
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
