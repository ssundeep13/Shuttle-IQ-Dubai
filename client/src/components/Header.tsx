import { UserPlus, Calendar, MapPin, Building2, LogOut, Shield, LayoutGrid, ChevronDown } from "lucide-react";
import { Wordmark } from '@/components/Wordmark';
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
  // Gate 3 (5.10): stats used to render as confident zeros while loading.
  statsReady: boolean;
  session: Session | null;
  onAddPlayer: () => void;
  onEndSession: () => void;
  authState: "guest" | "admin";
  onLogin: () => void;
  onAdmin: () => void;
  onLogout: () => void;
}

export function Header({
  stats,
  statsReady,
  session,
  onAddPlayer,
  onEndSession,
  authState,
  onLogin,
  onAdmin,
  onLogout,
}: HeaderProps) {
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Top Bar — Logo + Session Status + Auth */}
      {/* flex-wrap + min-w-0: this row's intrinsic width (~412px) forced a
          page-wide horizontal pan on every tab below 412px. Groups now shrink
          and the auth cluster wraps right-aligned when the line is tight. */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 py-3 px-4 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Wordmark as="h1" size={24} />
          {session && (
            <Badge variant="outline" className="bg-success/10 text-success border-success/20 whitespace-nowrap shrink-0">
              Active Session
            </Badge>
          )}
        </div>

        {/* Auth Controls */}
        <div className="flex items-center gap-2 ml-auto">
          {authState === "guest" ? (
            <Button
              onClick={onLogin}
              variant="outline"
              size="sm"
              className="min-h-11"
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
              className="min-h-11"
                data-testid="button-admin-nav"
              >
                <Shield className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
              <Button
                onClick={onLogout}
                variant="ghost"
                size="sm"
              className="min-h-11"
                aria-label="Log out"
                data-testid="button-logout-nav"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Session Info Strip — collapsible */}
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
                <div className="hidden sm:flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{session.venueName}</span>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm"
              className="min-h-11">
                  Details
                  <ChevronDown
                    className={`h-4 w-4 ml-2 transition-transform ${
                      sessionDetailsOpen ? "rotate-180" : ""
                    }`}
                  />
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
                {/* Venue name shown here on mobile since it's hidden in the strip above */}
                <div className="flex items-center gap-2 sm:hidden">
                  <Building2 className="h-4 w-4" />
                  <span>{session.venueName}</span>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Action Strip — Add Player on left, End Session on right.
          Auto Assign and Import are intentionally removed; the server-side
          auto-matchmaking engine runs automatically after each game. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card rounded-lg border border-border">
        <Button
          onClick={onAddPlayer}
          size="sm"
              className="min-h-11"
          data-testid="button-add-player"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add Player
        </Button>

        {session && (
          <Button
            variant="destructive"
            size="sm"
              className="min-h-11"
            onClick={onEndSession}
            data-testid="button-end-session"
          >
            <LogOut className="h-4 w-4 mr-2" />
            End Session
          </Button>
        )}
      </div>

      {/* Stats line — single row of separated figures (court-bands Gate 3
          replaced the 5-chip grid). Court cards carry the live detail. */}
      <div
        className="flex items-center gap-x-3 gap-y-1 flex-wrap px-1 text-sm text-muted-foreground"
        data-testid="stats-line"
      >
        <span data-testid="text-active-players">
          <span className="font-semibold text-foreground">{statsReady ? stats.activePlayers : "—"}</span> playing
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid="text-queue-count">
          <span className="font-semibold text-foreground">{statsReady ? stats.inQueue : "—"}</span> in queue
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid="text-available-courts">
          <span className="font-semibold text-foreground">{statsReady ? `${stats.availableCourts}/${stats.totalCourts}` : "—"}</span> courts free
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid="text-occupied-courts">
          <span className="font-semibold text-foreground">{statsReady ? stats.occupiedCourts : "—"}</span> in progress
        </span>
        <span aria-hidden="true">·</span>
        <span data-testid="text-total-players">
          <span className="font-semibold text-foreground">{statsReady ? stats.totalPlayers : "—"}</span> players
        </span>
      </div>
    </div>
  );
}
