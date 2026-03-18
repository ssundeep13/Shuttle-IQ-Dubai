import React, { useState, useMemo } from 'react';
import { Calendar, Clock, MapPin, Users, ArrowRight, CheckCircle } from 'lucide-react';

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

const TODAY_STR = "2026-03-26";
const TODAY = new Date(TODAY_STR + "T00:00:00");

export default function WeeklySpotlight() {
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(TODAY);
      d.setDate(TODAY.getDate() + i);
      const dateString = d.toISOString().split('T')[0];
      const daySessions = MOCK_SESSIONS.filter(s => s.date === dateString);
      return {
        date: d,
        dateString,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: d.getDate(),
        sessionCount: daySessions.length,
      };
    });
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(weekDays[0].dateString);

  const selectedSessions = useMemo(() => MOCK_SESSIONS.filter(s => s.date === selectedDate), [selectedDate]);
  const selectedDayInfo = useMemo(() => weekDays.find(d => d.dateString === selectedDate), [selectedDate, weekDays]);

  const getDayLabel = (dateString: string) => {
    if (dateString === TODAY_STR) return "Today";
    const d = new Date(TODAY);
    d.setDate(d.getDate() + 1);
    if (dateString === d.toISOString().split('T')[0]) return "Tomorrow";
    return new Date(dateString + "T00:00:00").toLocaleDateString('en-US', { weekday: 'long' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-7">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-6 h-6 text-secondary" />
            <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
          </div>
          <p className="text-muted-foreground">Book your next game at top venues across Dubai.</p>
        </div>

        {/* Week Strip */}
        <div className="bg-card rounded-xl border border-border p-3 mb-7 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {weekDays.map((day) => {
              const isSelected = day.dateString === selectedDate;
              const hasSessions = day.sessionCount > 0;
              const isToday = day.dateString === TODAY_STR;

              return (
                <button
                  key={day.dateString}
                  onClick={() => setSelectedDate(day.dateString)}
                  className={`relative flex flex-col items-center justify-center w-16 py-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                      : hasSessions
                        ? 'bg-background border-border text-foreground hover:border-primary/40'
                        : 'bg-background border-border text-muted-foreground'
                  }`}
                >
                  <span className={`text-[10px] font-medium uppercase tracking-wider mb-0.5 ${isSelected ? 'text-primary-foreground/70' : isToday ? 'text-primary font-bold' : ''}`}>
                    {isToday ? "Today" : day.dayName}
                  </span>
                  <span className="text-xl font-bold">{day.dayNumber}</span>
                  {hasSessions && (
                    <span className={`absolute -top-1.5 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold border border-background ${isSelected ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'}`}>
                      {day.sessionCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-secondary" />
            {getDayLabel(selectedDate)}, {selectedDayInfo?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </h2>
          <span className="text-sm text-muted-foreground">
            {selectedSessions.length} {selectedSessions.length === 1 ? 'session' : 'sessions'} available
          </span>
        </div>

        {/* Sessions Grid */}
        {selectedSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {selectedSessions.map((session) => {
              const isBooked = session.userBooked;
              const isFull = session.spotsRemaining === 0;
              const spotsLow = !isFull && session.spotsRemaining <= 3;
              const capacityPercent = (session.totalBookings / session.capacity) * 100;

              return (
                <div
                  key={session.id}
                  className="bg-card rounded-xl overflow-hidden border border-border shadow-sm flex flex-col"
                  data-testid={`card-session-${session.id}`}
                >
                  {/* Gradient Header — Primary (navy) to Secondary (teal) */}
                  <div className="bg-gradient-to-r from-primary to-secondary p-5 relative">
                    <div className="relative z-10 flex justify-between items-start">
                      <div>
                        <div className="text-primary-foreground/60 text-xs font-medium mb-1">
                          {new Date(session.date + "T00:00:00").toLocaleDateString('en-US', { weekday: 'long' })}
                        </div>
                        <div className="text-primary-foreground text-2xl font-bold">
                          {new Date(session.date + "T00:00:00").toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      {isBooked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-primary-foreground border border-white/30 text-xs font-medium">
                          <CheckCircle className="w-3 h-3" /> Booked
                        </span>
                      ) : isFull ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-destructive/20 text-destructive-foreground border border-destructive/30 text-xs font-medium">
                          Full
                        </span>
                      ) : spotsLow ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/20 text-primary-foreground border border-white/30 text-xs font-medium">
                          {session.spotsRemaining} left
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/20 text-primary-foreground border border-white/30 text-xs font-medium">
                          {session.spotsRemaining} spots
                        </span>
                      )}
                    </div>
                    {/* Decorative rings */}
                    <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none">
                      <svg width="100" height="100" viewBox="0 0 100 100">
                        <circle cx="80" cy="80" r="40" fill="white" />
                        <circle cx="80" cy="80" r="60" fill="none" stroke="white" strokeWidth="2" />
                      </svg>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-grow flex flex-col">
                    <h3 className="text-base font-semibold text-foreground mb-4 line-clamp-2">{session.title}</h3>

                    <div className="space-y-2.5 mb-4 flex-grow text-sm text-muted-foreground">
                      <div className="flex items-start gap-2.5">
                        <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="text-foreground font-medium">{session.startTime} - {session.endTime}</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-foreground font-medium">{session.venueName}</span>
                          <span className="block text-sm">{session.venueLocation}</span>
                          <a href={session.venueMapUrl} target="_blank" rel="noopener noreferrer" className="text-secondary text-xs font-medium hover:underline mt-0.5 inline-block">
                            View on Map
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Users className="w-4 h-4 shrink-0" />
                        <span>{session.courtCount} courts</span>
                      </div>
                    </div>

                    {/* Capacity */}
                    <div className="mb-4 bg-muted/50 rounded-lg p-3 border border-border">
                      <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>Capacity</span>
                        <span>{session.totalBookings} / {session.capacity} booked</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isFull ? 'bg-destructive' : 'bg-secondary'}`}
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{session.description}</p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-border mt-auto">
                      <div>
                        <span className="text-xs text-muted-foreground block">Price</span>
                        <span className="text-xl font-bold text-foreground">AED {session.priceAed}</span>
                      </div>
                      {isBooked ? (
                        <a href={`/marketplace/sessions/${session.id}`} className="px-4 py-2 bg-muted text-foreground font-medium rounded-lg text-sm inline-flex items-center gap-1.5">
                          View Booking
                        </a>
                      ) : isFull ? (
                        <button disabled className="px-4 py-2 bg-muted text-muted-foreground font-medium rounded-lg text-sm cursor-not-allowed opacity-60">
                          View Details
                        </button>
                      ) : (
                        <a href={`/marketplace/sessions/${session.id}`} className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg text-sm inline-flex items-center gap-1.5 shadow-sm">
                          View & Book <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-card rounded-xl p-10 border border-border text-center flex flex-col items-center">
            <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">No sessions scheduled</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-5">
              There are no badminton sessions on {getDayLabel(selectedDate).toLowerCase()}. 
              Try checking other days in the week above.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {weekDays.filter(d => d.sessionCount > 0).slice(0, 3).map(day => (
                <button
                  key={day.dateString}
                  onClick={() => setSelectedDate(day.dateString)}
                  className="px-3 py-1.5 bg-muted text-foreground rounded-lg text-sm font-medium border border-border hover:border-primary/40 transition-colors"
                >
                  {day.dayName} {day.dayNumber}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
