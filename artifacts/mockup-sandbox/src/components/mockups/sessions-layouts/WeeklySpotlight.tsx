import React, { useState, useMemo } from 'react';
import { Calendar, Clock, MapPin, Users, ArrowRight, CheckCircle2 } from 'lucide-react';

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
    imageUrl: null,
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
    imageUrl: null,
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
    imageUrl: null,
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
    imageUrl: null,
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
    imageUrl: null,
  },
];

// Mocking "today" to be March 26, 2026 based on the data provided and the requirement
const TODAY_STR = "2026-03-26";
const TODAY = new Date(TODAY_STR);

export default function WeeklySpotlight() {
  // Generate the next 7 days
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
        sessionCount: daySessions.length
      };
    });
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(weekDays[0].dateString);

  const selectedSessions = useMemo(() => {
    return MOCK_SESSIONS.filter(s => s.date === selectedDate);
  }, [selectedDate]);

  const selectedDayInfo = useMemo(() => {
    return weekDays.find(d => d.dateString === selectedDate);
  }, [selectedDate, weekDays]);

  const getDayLabel = (dateString: string) => {
    if (dateString === TODAY_STR) return "Today";
    const d = new Date(dateString);
    const tomorrow = new Date(TODAY);
    tomorrow.setDate(TODAY.getDate() + 1);
    if (dateString === tomorrow.toISOString().split('T')[0]) return "Tomorrow";
    return new Date(dateString).toLocaleDateString('en-US', { weekday: 'long' });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Find a Session</h1>
          <p className="text-slate-500">Book your next game at top venues across Dubai.</p>
        </div>

        {/* Week Strip */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-8 overflow-x-auto no-scrollbar">
          <div className="flex justify-between md:justify-start gap-2 md:gap-4 min-w-max">
            {weekDays.map((day) => {
              const isSelected = day.dateString === selectedDate;
              const hasSessions = day.sessionCount > 0;
              
              return (
                <button
                  key={day.dateString}
                  onClick={() => setSelectedDate(day.dateString)}
                  className={`
                    flex flex-col items-center justify-center w-16 md:w-20 py-3 rounded-xl transition-all relative
                    ${isSelected 
                      ? 'bg-blue-900 text-white shadow-md ring-2 ring-blue-900 ring-offset-2' 
                      : hasSessions
                        ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        : 'bg-transparent text-slate-400 hover:bg-slate-50'}
                  `}
                >
                  <span className={`text-xs font-medium uppercase tracking-wider mb-1 ${isSelected ? 'text-blue-200' : ''}`}>
                    {day.dayName}
                  </span>
                  <span className={`text-2xl font-bold ${isSelected ? 'text-white' : ''}`}>
                    {day.dayNumber}
                  </span>
                  
                  {/* Session Badge */}
                  {hasSessions && (
                    <span className={`
                      absolute -top-2 -right-1 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold border-2 border-white
                      ${isSelected ? 'bg-teal-500 text-white' : 'bg-blue-600 text-white'}
                    `}>
                      {day.sessionCount}
                    </span>
                  )}
                  
                  {day.dateString === TODAY_STR && (
                    <div className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-blue-300' : 'bg-blue-600'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            {getDayLabel(selectedDate)}, {selectedDayInfo?.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </h2>
          <span className="text-sm font-medium text-slate-500">
            {selectedSessions.length} {selectedSessions.length === 1 ? 'session' : 'sessions'} available
          </span>
        </div>

        {/* Sessions Grid */}
        {selectedSessions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {selectedSessions.map((session) => {
              const isBooked = session.id === "s1";
              const isFull = session.spotsRemaining === 0;
              const capacityPercent = (session.totalBookings / session.capacity) * 100;
              
              return (
                <div 
                  key={session.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col transition-transform hover:-translate-y-1 hover:shadow-md duration-300"
                >
                  {/* Card Header (Gradient) */}
                  <div className="bg-gradient-to-r from-blue-900 to-teal-800 p-6 relative">
                    <div className="relative z-10 flex justify-between items-start">
                      <div>
                        <div className="text-blue-100 text-sm font-medium mb-1">
                          {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long' })}
                        </div>
                        <div className="text-white text-3xl font-bold tracking-tight">
                          {new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      
                      {/* Status Badge */}
                      {isBooked ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-sm font-medium backdrop-blur-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          Booked
                        </span>
                      ) : isFull ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-sm font-medium backdrop-blur-sm">
                          Full
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/20 text-white border border-white/30 text-sm font-medium backdrop-blur-sm">
                          {session.spotsRemaining} spots left
                        </span>
                      )}
                    </div>
                    
                    {/* Decorative pattern */}
                    <div className="absolute right-0 bottom-0 opacity-10">
                      <svg width="120" height="120" viewBox="0 0 100 100">
                        <circle cx="80" cy="80" r="40" fill="currentColor" />
                        <circle cx="80" cy="80" r="60" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="80" cy="80" r="80" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-6 flex-grow flex flex-col">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 line-clamp-2">
                      {session.title}
                    </h3>

                    <div className="space-y-3 mb-6 flex-grow">
                      <div className="flex items-start gap-3 text-slate-600">
                        <Clock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-slate-900">{session.startTime} - {session.endTime}</p>
                          <p className="text-sm text-slate-500">2 hours duration</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 text-slate-600">
                        <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-slate-900">{session.venueName}</p>
                          <p className="text-sm text-slate-500">{session.venueLocation}</p>
                          <a 
                            href={session.venueMapUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 text-sm font-medium hover:underline inline-flex items-center gap-1 mt-1"
                          >
                            View on map
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-slate-600 pt-1">
                        <Users className="w-5 h-5 text-slate-400 shrink-0" />
                        <span className="font-medium">{session.courtCount} Courts</span>
                      </div>
                    </div>

                    {/* Capacity Progress */}
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-slate-700">Capacity</span>
                        <span className="text-slate-500">
                          {session.totalBookings} / {session.capacity} players
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-2 rounded-full ${isFull ? 'bg-red-500' : 'bg-teal-500'}`} 
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                      <p className="text-sm text-slate-500 mt-3 line-clamp-2">
                        {session.description}
                      </p>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                      <div>
                        <span className="text-sm text-slate-500">Price</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-slate-900">AED {session.priceAed}</span>
                        </div>
                      </div>
                      
                      {isBooked ? (
                        <a href={`/marketplace/sessions/${session.id}`} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl inline-flex items-center gap-2">
                          View Booking
                        </a>
                      ) : isFull ? (
                        <button disabled className="px-6 py-2.5 bg-slate-100 text-slate-400 font-medium rounded-xl cursor-not-allowed opacity-60">
                          View Details
                        </button>
                      ) : (
                        <a href={`/marketplace/sessions/${session.id}`} className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-xl shadow-sm shadow-blue-600/20 inline-flex items-center gap-2">
                          View &amp; Book
                          <ArrowRight className="w-4 h-4" />
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
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              No sessions scheduled
            </h3>
            <p className="text-slate-500 max-w-md mb-6">
              There are no badminton sessions scheduled for {getDayLabel(selectedDate).toLowerCase()}. 
              Check other days in the week above to find available games.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {weekDays.filter(d => d.sessionCount > 0).slice(0, 3).map(day => (
                <button
                  key={day.dateString}
                  onClick={() => setSelectedDate(day.dateString)}
                  className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-medium transition-colors"
                >
                  View {day.dayName}, {day.dayNumber}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
