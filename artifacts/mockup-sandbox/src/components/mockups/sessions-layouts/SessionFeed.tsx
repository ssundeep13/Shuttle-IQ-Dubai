import React, { useState } from 'react';
import { Calendar, Search, Clock, MapPin, Users, ArrowRight, CheckCircle } from 'lucide-react';

const MOCK_SESSIONS = [
  {
    id: "s1",
    title: "Springdales School Dubai Session",
    date: "2026-03-26",
    startTime: "20:00",
    endTime: "22:00",
    venueName: "Springdales School Dubai",
    venueLocation: "Al Quoz Fourth - Al Quoz",
    venueMapUrl: "https://maps.google.com",
    courtCount: 3,
    capacity: 18,
    totalBookings: 0,
    spotsRemaining: 18,
    priceAed: 40,
    description: "All levels welcome. Seamless payment available online or via Careem Pay at the venue.",
    status: "upcoming",
    userBooked: true,
    level: "beginner",
  },
  {
    id: "s2",
    title: "Springdales School Dubai Session",
    date: "2026-03-28",
    startTime: "18:00",
    endTime: "20:00",
    venueName: "Springdales School Dubai",
    venueLocation: "Al Quoz Fourth - Al Quoz",
    venueMapUrl: "https://maps.google.com",
    courtCount: 3,
    capacity: 18,
    totalBookings: 6,
    spotsRemaining: 12,
    priceAed: 40,
    description: "All levels welcome. Seamless payment available online or via Careem Pay at the venue.",
    status: "upcoming",
    userBooked: false,
    level: "general",
  },
  {
    id: "s3",
    title: "Al Barsha Sports Complex — Advanced",
    date: "2026-03-28",
    startTime: "10:00",
    endTime: "12:00",
    venueName: "Al Barsha Sports Complex",
    venueLocation: "Al Barsha - Dubai",
    venueMapUrl: "https://maps.google.com",
    courtCount: 5,
    capacity: 20,
    totalBookings: 18,
    spotsRemaining: 2,
    priceAed: 55,
    description: "Intermediate to advanced players only. High-intensity matches.",
    status: "upcoming",
    userBooked: false,
    level: "advanced",
  },
  {
    id: "s4",
    title: "Dubai Sports City — Intermediate",
    date: "2026-03-30",
    startTime: "19:00",
    endTime: "21:00",
    venueName: "Dubai Sports City Badminton Hall",
    venueLocation: "Motor City - Dubai",
    venueMapUrl: "https://maps.google.com",
    courtCount: 4,
    capacity: 16,
    totalBookings: 16,
    spotsRemaining: 0,
    priceAed: 45,
    description: "Regular intermediate session with rotation system.",
    status: "upcoming",
    userBooked: false,
    level: "intermediate",
  },
  {
    id: "s5",
    title: "JLT Weekend Open — All Levels",
    date: "2026-04-01",
    startTime: "08:00",
    endTime: "10:00",
    venueName: "JLT Multi Sports Arena",
    venueLocation: "Jumeirah Lakes Towers - Dubai",
    venueMapUrl: "https://maps.google.com",
    courtCount: 6,
    capacity: 24,
    totalBookings: 8,
    spotsRemaining: 16,
    priceAed: 35,
    description: "Weekend open play. All skill levels, beginners especially welcome.",
    status: "upcoming",
    userBooked: false,
    level: "beginner",
  },
];

const formatDateChip = (dateStr: string) => {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Left accent border color based on skill level (semantic skill-level indicator)
const getLevelBorderColor = (level?: string) => {
  switch (level) {
    case 'advanced':     return 'border-l-purple-500';
    case 'intermediate': return 'border-l-blue-500';
    case 'beginner':     return 'border-l-green-500';
    default:             return 'border-l-secondary';
  }
};

export default function SessionFeed() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = MOCK_SESSIONS.filter(session => {
    const q = searchQuery.toLowerCase();
    return !q || session.venueName.toLowerCase().includes(q) || session.venueLocation.toLowerCase().includes(q);
  });

  // Group by date
  const groupedSessions = filteredSessions.reduce((acc, session) => {
    if (!acc[session.date]) acc[session.date] = [];
    acc[session.date].push(session);
    return acc;
  }, {} as Record<string, typeof MOCK_SESSIONS>);

  const sortedDates = Object.keys(groupedSessions).sort();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-16">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-6 h-6 text-secondary" />
            <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
          </div>
          <p className="text-muted-foreground text-sm">Browse and book upcoming badminton sessions across Dubai</p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            placeholder="Search venues or locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Feed */}
        <div className="space-y-7">
          {sortedDates.length === 0 ? (
            <div className="text-center py-10 bg-card rounded-xl border border-border">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground mb-4">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">No sessions found</h3>
              <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search terms.</p>
            </div>
          ) : (
            sortedDates.map((date) => {
              const dateSessions = groupedSessions[date];
              return (
                <div key={date} className="space-y-3">

                  {/* Inline Date Chip Separator */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-medium bg-muted px-3 py-1 rounded-full border border-border whitespace-nowrap">
                      {formatDateChip(date)} · {dateSessions.length} session{dateSessions.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Session Cards */}
                  <div className="space-y-2">
                    {dateSessions.map(session => {
                      const isFull = session.spotsRemaining === 0;
                      const isBooked = session.userBooked;
                      const spotsLow = !isFull && session.spotsRemaining <= 3;
                      const percentBooked = (session.totalBookings / session.capacity) * 100;

                      let badgeText = `${session.spotsRemaining} spots`;
                      let badgeCls = "bg-muted text-muted-foreground";
                      if (isBooked)    { badgeText = "Booked"; badgeCls = "bg-green-100 text-green-700"; }
                      else if (isFull) { badgeText = "Full";   badgeCls = "bg-red-100 text-red-700"; }
                      else if (spotsLow) { badgeText = `${session.spotsRemaining} left`; badgeCls = "bg-orange-100 text-orange-700"; }

                      return (
                        <div
                          key={session.id}
                          className={`bg-card rounded-lg border border-border border-l-[3px] ${getLevelBorderColor(session.level)} flex flex-col sm:flex-row overflow-hidden`}
                          data-testid={`card-session-${session.id}`}
                        >
                          {/* Left — Details */}
                          <div className="flex-1 p-4 min-w-0">
                            <h3 className="font-semibold text-foreground truncate mb-2">{session.title}</h3>

                            <div className="space-y-1.5 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span className="text-foreground">{session.startTime} - {session.endTime}</span>
                              </div>
                              <div className="flex items-start gap-2">
                                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                <span className="line-clamp-1">{session.venueName} · {session.venueLocation}</span>
                              </div>
                              {session.venueMapUrl && (
                                <a href={session.venueMapUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ml-5 text-xs text-secondary font-medium hover:underline">
                                  View on Map
                                </a>
                              )}
                              <div className="flex items-center gap-2">
                                <Users className="w-3.5 h-3.5 shrink-0" />
                                <span>{session.courtCount} courts</span>
                              </div>
                            </div>

                            {/* Capacity bar */}
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>{session.totalBookings} / {session.capacity} booked</span>
                              </div>
                              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isFull ? 'bg-destructive' : 'bg-secondary'}`}
                                  style={{ width: `${Math.min(100, percentBooked)}%` }}
                                />
                              </div>
                            </div>

                            <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{session.description}</p>
                          </div>

                          {/* Right — Price + CTA */}
                          <div className="shrink-0 sm:w-44 bg-muted/30 sm:border-l border-border border-t sm:border-t-0 p-4 flex flex-col justify-between items-center sm:items-stretch gap-3">
                            <div className="text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeCls}`}>
                                {isBooked && <CheckCircle className="w-3 h-3" />}
                                {badgeText}
                              </span>
                            </div>
                            <div className="text-center">
                              <span className="text-2xl font-bold text-foreground">{session.priceAed}</span>
                              <span className="text-xs text-muted-foreground ml-1">AED</span>
                            </div>
                            {isBooked ? (
                              <a href={`/marketplace/sessions/${session.id}`} className="block w-full py-2 px-3 bg-card border border-border text-foreground font-medium rounded-lg text-sm text-center">
                                View Booking
                              </a>
                            ) : isFull ? (
                              <button disabled className="w-full py-2 px-3 bg-muted text-muted-foreground font-medium rounded-lg text-sm cursor-not-allowed opacity-60">
                                View Details
                              </button>
                            ) : (
                              <a href={`/marketplace/sessions/${session.id}`} className="block w-full py-2 px-3 bg-primary text-primary-foreground font-medium rounded-lg text-sm text-center flex items-center justify-center gap-1.5">
                                View &amp; Book <ArrowRight className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
