import { UserPlus, Activity, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppStats } from "@shared/schema";

interface HeaderProps {
  stats: AppStats;
  onAddPlayer: () => void;
  onAutoAssign: () => void;
  onImportPlayers: () => void;
}

export function Header({ stats, onAddPlayer, onAutoAssign, onImportPlayers }: HeaderProps) {
  return (
    <div className="bg-card rounded-lg shadow-md p-6 mb-6 border border-card-border">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-4xl font-bold">
            <span className="text-primary">Shuttle</span>
            <span className="text-chart-2">IQ</span>
          </h1>
          <div className="border-l-2 border-border pl-6 hidden sm:block">
            <p className="text-muted-foreground text-sm font-medium">Smart Badminton</p>
            <p className="text-muted-foreground text-sm font-medium">Queue Management</p>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto flex-wrap">
          <Button 
            onClick={onAddPlayer} 
            className="flex-1 md:flex-initial"
            data-testid="button-add-player"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Player
          </Button>
          <Button 
            onClick={onImportPlayers} 
            variant="outline"
            className="flex-1 md:flex-initial"
            data-testid="button-import-players"
          >
            <Download className="w-4 h-4 mr-2" />
            Import Players
          </Button>
          <Button 
            onClick={onAutoAssign} 
            variant="secondary"
            className="flex-1 md:flex-initial bg-chart-2 hover:bg-chart-2/90 text-white border-none"
            data-testid="button-auto-assign"
          >
            <Activity className="w-4 h-4 mr-2" />
            Auto Assign
          </Button>
        </div>
      </div>

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
