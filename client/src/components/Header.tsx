import { UserPlus, Activity, Download, Calendar, MapPin, Building2, LogOut, Shield, Users, Trophy, LayoutGrid, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppStats, Session } from "@shared/schema";
import { format } from "date-fns";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

interface HeaderProps {
  stats: AppStats;
  session: Session | null;
  onAddPlayer: () => void;
  onAutoAssign: () => void;
  onImportPlayers: () => void;
  onEndSession: () => void;
  authState: "guest" | "admin";
  onLogin: () => void;
  onAdmin: () => void;
  onLogout: () => void;
}

function KPIChip({ icon: Icon, label, value, color, testId }: { 
  icon: any; 
  label: string; 
  value: string | number; 
  color: string;
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card rounded-lg px-4 py-3 border border-border hover-elevate">
      <div className={`p-2 rounded-md ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-col">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold" data-testid={testId}>{value}</p>
      </div>
    </div>
  );
}

export function Header({ stats, session, onAddPlayer, onAutoAssign, onImportPlayers, onEndSession, authState, onLogin, onAdmin, onLogout }: HeaderProps) {
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Top Bar - Logo + Session Status + Auth */}
      <div className="flex items-center justify-between py-3 px-4 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">
            <span className="text-primary">Shuttle</span>
            <span className="text-chart-2">IQ</span>
          </h1>
          {session && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
              Active Session
            </Badge>
          )}
        </div>

        {/* Auth Controls */}
        <div className="flex items-center gap-2">
          {authState === "guest" ? (
            <Button 
              onClick={onLogin} 
              variant="outline"
              size="sm"
              data-testid="button-login-nav"
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin Login
            </Button>
          ) : (
            <>
              <Button 
                onClick={onAdmin} 
                variant="ghost"
                size="sm"
                data-testid="button-admin-nav"
              >
                <Shield className="w-4 h-4 mr-2" />
                Admin
              </Button>
              <Button 
                onClick={onLogout} 
                variant="ghost"
                size="sm"
                data-testid="button-logout-nav"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Session Info - Collapsible */}
      {session && (
        <Collapsible open={sessionDetailsOpen} onOpenChange={setSessionDetailsOpen}>
          <div className="bg-card rounded-lg border border-border px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {format(new Date(session.date), 'MMM dd, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{session.venueName}</span>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  Details
                  <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${sessionDetailsOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2 pt-2 border-t border-border">
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {session.venueLocation && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{session.venueLocation}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span>{session.courtCount} Courts Available</span>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Action Strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <Button 
            onClick={onAddPlayer}
            size="sm"
            data-testid="button-add-player"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Player
          </Button>
          <Button 
            onClick={onImportPlayers} 
            variant="outline"
            size="sm"
            data-testid="button-import-players"
          >
            <Download className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button 
            onClick={onAutoAssign} 
            variant="secondary"
            size="sm"
            className="bg-chart-2 hover:bg-chart-2/90 text-white border-none"
            data-testid="button-auto-assign"
          >
            <Activity className="w-4 h-4 mr-2" />
            Auto Assign
          </Button>
        </div>
        {session && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onEndSession}
            data-testid="button-end-session"
          >
            <LogOut className="h-4 w-4 mr-2" />
            End Session
          </Button>
        )}
      </div>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPIChip 
          icon={Users} 
          label="Playing" 
          value={stats.activePlayers}
          color="bg-primary/10 text-primary"
          testId="text-active-players"
        />
        <KPIChip 
          icon={Users} 
          label="In Queue" 
          value={stats.inQueue}
          color="bg-chart-2/10 text-chart-2"
          testId="text-queue-count"
        />
        <KPIChip 
          icon={LayoutGrid} 
          label="Available" 
          value={`${stats.availableCourts}/${stats.totalCourts}`}
          color="bg-success/10 text-success"
          testId="text-available-courts"
        />
        <KPIChip 
          icon={Activity} 
          label="In Progress" 
          value={stats.occupiedCourts}
          color="bg-warning/10 text-warning"
          testId="text-occupied-courts"
        />
        <KPIChip 
          icon={Trophy} 
          label="Total Players" 
          value={stats.totalPlayers}
          color="bg-accent/10 text-accent"
          testId="text-total-players"
        />
      </div>
    </div>
  );
}
