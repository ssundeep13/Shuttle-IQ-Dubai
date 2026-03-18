import React, { useState } from "react";
import { CalendarDays, Search, Clock, MapPin, Users, ChevronRight, Filter, CheckCircle } from "lucide-react";

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
    description: "All levels welcome. Seamless payment available online or via Careem Pay at the venue. Waitlisted players will receive notifications.",
    status: "upcoming",
    userBooked: true,
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
  },
];

const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

const getLeftPanelInfo = (dateStr: string) => {
  const date = new Date(dateStr + "T00:00:00");
  return {
    dayAbbrev: date.toLocaleDateString("en-US", { weekday: "short" }),
    dayNumber: date.getDate(),
    monthAbbrev: date.toLocaleDateString("en-US", { month: "short" }),
  };
};

const generateDateStrip = () => {
  const uniqueDates = Array.from(new Set(MOCK_SESSIONS.map((s) => s.date))).sort();
  return uniqueDates.map((dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return {
      dateStr,
      dayAbbrev: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNumber: d.getDate(),
    };
  });
};

const TODAY_DATE = "2026-03-26";

export default function TimelineList() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const dateStrip = generateDateStrip();

  const filteredSessions = MOCK_SESSIONS.filter((s) => {
    if (s.status !== "upcoming") return false;
    if (selectedDate && s.date !== selectedDate) return false;
    if (
      searchQuery &&
      !s.venueName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.venueLocation.toLowerCase().includes(searchQuery.toLowerCase())
    ) return false;
    return true;
  });

  const groupedSessions = filteredSessions.reduce((acc, session) => {
    if (!acc[session.date]) acc[session.date] = [];
    acc[session.date].push(session);
    return acc;
  }, {} as Record<string, typeof MOCK_SESSIONS>);

  const sortedDates = Object.keys(groupedSessions).sort();

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 font-sans">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-10 pb-5 shadow-sm">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <CalendarDays size={22} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sessions</h1>
          </div>
          <p className="text-muted-foreground mb-5 ml-1">
            Browse and book upcoming badminton sessions across Dubai
          </p>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input
              type="text"
              placeholder="Search venues or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-5">
        {/* Date Strip Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Select Date
          </h2>
          <button
            onClick={() => setSelectedDate(null)}
            className={`text-sm font-medium transition-colors ${
              selectedDate === null ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Dates
          </button>
        </div>

        {/* Horizontal Date Strip */}
        <div className="flex overflow-x-auto pb-3 -mx-4 px-4 gap-2">
          {dateStrip.map((d) => {
            const isSelected = selectedDate === d.dateStr;
            const isToday = d.dateStr === TODAY_DATE;
            return (
              <button
                key={d.dateStr}
                onClick={() => setSelectedDate(d.dateStr)}
                className={`shrink-0 flex flex-col items-center justify-center w-16 py-3 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-primary border-primary text-primary-foreground shadow-md"
                    : "bg-card border-border text-foreground hover:border-primary/40"
                }`}
              >
                <span className={`text-[11px] font-medium mb-0.5 ${isSelected ? "text-primary-foreground/70" : isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {isToday ? "Today" : d.dayAbbrev}
                </span>
                <span className="text-xl font-bold">{d.dayNumber}</span>
                {isToday && !isSelected && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Sessions List */}
        <div className="mt-5 space-y-8">
          {sortedDates.length === 0 ? (
            <div className="bg-card rounded-xl p-10 text-center border border-border">
              <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Filter size={22} className="text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">No sessions found</h3>
              <p className="text-muted-foreground text-sm">Try adjusting your search or date filters.</p>
              <button
                onClick={() => { setSelectedDate(null); setSearchQuery(""); }}
                className="mt-4 text-sm text-primary font-medium hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            sortedDates.map((dateStr) => {
              const sessions = groupedSessions[dateStr];
              return (
                <div key={dateStr} className="space-y-3">
                  {/* Date Group Header */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground border border-border">
                      <CalendarDays size={14} />
                    </div>
                    <h3 className="text-base font-bold text-foreground">
                      {formatDateHeader(dateStr)}
                    </h3>
                    <span className="ml-auto bg-muted text-muted-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                      {sessions.length} session{sessions.length !== 1 && "s"}
                    </span>
                  </div>

                  {/* Session Cards */}
                  <div className="space-y-3 pl-3 border-l-2 border-border ml-3">
                    {sessions.map((session) => {
                      const panelInfo = getLeftPanelInfo(session.date);
                      const isFull = session.spotsRemaining === 0;
                      const isBooked = session.userBooked;
                      const spotsLow = !isFull && session.spotsRemaining <= 3;
                      const progressPct = session.capacity > 0 ? (session.totalBookings / session.capacity) * 100 : 0;

                      let badgeText = `${session.spotsRemaining} spots`;
                      let badgeCls = "bg-muted text-muted-foreground";
                      if (isBooked) { badgeText = "Booked"; badgeCls = "bg-green-100 text-green-700"; }
                      else if (isFull) { badgeText = "Full"; badgeCls = "bg-red-100 text-red-700"; }
                      else if (spotsLow) { badgeText = `${session.spotsRemaining} left`; badgeCls = "bg-orange-100 text-orange-700"; }

                      return (
                        <div
                          key={session.id}
                          className="flex flex-col sm:flex-row rounded-xl overflow-hidden border border-border bg-card shadow-sm"
                          data-testid={`card-session-${session.id}`}
                        >
                          {/* Left Panel — Primary color date block */}
                          <div className="sm:w-24 flex sm:flex-col items-center justify-center p-3 sm:p-0 flex-row gap-3 sm:gap-1 bg-primary text-primary-foreground">
                            <span className="text-primary-foreground/60 text-xs font-medium uppercase tracking-widest">
                              {panelInfo.dayAbbrev}
                            </span>
                            <span className="text-3xl sm:text-4xl font-black leading-none">
                              {panelInfo.dayNumber}
                            </span>
                            <span className="text-primary-foreground/80 text-xs font-medium">
                              {panelInfo.monthAbbrev}
                            </span>
                          </div>

                          {/* Right Panel — Details */}
                          <div className="flex-1 p-4">
                            <div className="flex justify-between items-start mb-3 gap-3">
                              <h4 className="text-base font-semibold text-foreground leading-tight">
                                {session.title}
                              </h4>
                              <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeCls}`}>
                                {isBooked && <CheckCircle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                                {badgeText}
                              </span>
                            </div>

                            <div className="space-y-1.5 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Clock size={14} className="shrink-0" />
                                <span className="text-foreground font-medium">{session.startTime} - {session.endTime}</span>
                              </div>
                              <div className="flex items-start gap-2">
                                <MapPin size={14} className="shrink-0 mt-0.5" />
                                <div>
                                  <span>{session.venueName}</span>
                                  {session.venueLocation && <span> · {session.venueLocation}</span>}
                                  {session.venueMapUrl && (
                                    <a href={session.venueMapUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block text-secondary font-medium text-xs mt-0.5">
                                      View on Map
                                    </a>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users size={14} className="shrink-0" />
                                <span>{session.courtCount} courts</span>
                              </div>
                            </div>

                            {/* Capacity bar */}
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>{session.totalBookings} / {session.capacity} booked</span>
                                <span>{Math.round(progressPct)}%</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isFull ? "bg-destructive" : isBooked ? "bg-green-500" : "bg-primary"}`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>

                            <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{session.description}</p>

                            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                              <span className="text-base font-bold text-foreground">AED {session.priceAed}</span>
                              {isFull && !isBooked ? (
                                <button disabled className="flex items-center px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium cursor-not-allowed opacity-60">
                                  View Details <ChevronRight size={14} className="ml-1" />
                                </button>
                              ) : (
                                <a
                                  href={`/marketplace/sessions/${session.id}`}
                                  className="flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground"
                                >
                                  {isBooked ? "View Booking" : "View & Book"}
                                  <ChevronRight size={14} className="ml-1" />
                                </a>
                              )}
                            </div>
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
