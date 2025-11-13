import { UserPlus, Activity, Download, Calendar, MapPin, Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppStats, Session } from "@shared/schema";
import { format } from "date-fns";

interface HeaderProps {
  stats: AppStats;
  session: Session | null;
  onAddPlayer: () => void;
  onAutoAssign: () => void;
  onImportPlayers: () => void;
  onEndSession: () => void;
}

export function Header({ stats, session, onAddPlayer, onAutoAssign, onImportPlayers, onEndSession }: HeaderProps) {
  return (
    <div className="bg-card rounded-lg shadow-md p-4 sm:p-6 mb-4 sm:mb-6 border border-card-border">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <h1 className="text-3xl sm:text-4xl font-bold">
            <span className="text-primary">Shuttle</span>
            <span className="text-chart-2">IQ</span>
          </h1>
          <div className="border-l-2 border-border pl-4 sm:pl-6 hidden sm:block">
            <p className="text-muted-foreground text-sm font-medium">Smart Badminton</p>
            <p className="text-muted-foreground text-sm font-medium">Queue Management</p>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-3 w-full md:w-auto flex-wrap">
          <Button 
            onClick={onAddPlayer} 
            className="flex-1 md:flex-initial min-h-12 sm:min-h-10"
            data-testid="button-add-player"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Add Player</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <Button 
            onClick={onImportPlayers} 
            variant="outline"
            className="flex-1 md:flex-initial min-h-12 sm:min-h-10"
            data-testid="button-import-players"
          >
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Import Players</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button 
            onClick={onAutoAssign} 
            variant="secondary"
            className="flex-1 md:flex-initial bg-chart-2 hover:bg-chart-2/90 text-white border-none min-h-12 sm:min-h-10"
            data-testid="button-auto-assign"
          >
            <Activity className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Auto Assign</span>
            <span className="sm:hidden">Auto</span>
          </Button>
        </div>
      </div>

      {/* Session Info */}
      {session && (
        <div className="bg-muted/50 rounded-md p-3 mb-4 border border-border/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-4 text-sm flex-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {format(new Date(session.date), 'MMM dd, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{session.venueName}</span>
              </div>
              {session.venueLocation && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{session.venueLocation}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{session.courtCount} Courts</span>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={onEndSession}
              className="min-h-12 sm:min-h-10"
              data-testid="button-end-session"
            >
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">End Session</span>
              <span className="sm:hidden">End</span>
            </Button>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm text-muted-foreground">Active Players</p>
          <p className="text-2xl font-bold text-primary" data-testid="text-active-players">
            {stats.activePlayers}
          </p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm text-muted-foreground">In Queue</p>
          <p className="text-2xl font-bold text-chart-2" data-testid="text-queue-count">
            {stats.inQueue}
          </p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm text-muted-foreground">Available</p>
          <p className="text-2xl font-bold text-success" data-testid="text-available-courts">
            {stats.availableCourts}/{stats.totalCourts}
          </p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm text-muted-foreground">In Progress</p>
          <p className="text-2xl font-bold text-warning" data-testid="text-occupied-courts">
            {stats.occupiedCourts}
          </p>
        </div>
        <div className="bg-muted rounded-md p-3">
          <p className="text-sm text-muted-foreground">Total Players</p>
          <p className="text-2xl font-bold text-foreground" data-testid="text-total-players">
            {stats.totalPlayers}
          </p>
        </div>
      </div>
    </div>
  );
}
