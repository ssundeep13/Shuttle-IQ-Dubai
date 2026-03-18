import React, { useState } from 'react';
import { Calendar, Search, Clock, MapPin, Users, ArrowRight, CheckCircle2 } from 'lucide-react';

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
    userBooked: true, // Special state for s1
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

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
};

const getLevelColor = (level?: string) => {
  switch (level) {
    case 'advanced': return 'border-purple-500';
    case 'intermediate': return 'border-blue-500';
    case 'beginner': return 'border-green-500';
    default: return 'border-teal-500';
  }
};

const getSpotsBadge = (session: typeof MOCK_SESSIONS[0]) => {
  if (session.userBooked) {
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3 h-3" /> Booked</span>;
  }
  if (session.spotsRemaining === 0) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Full</span>;
  }
  if (session.spotsRemaining <= 3) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Only {session.spotsRemaining} spots left</span>;
  }
  if (session.spotsRemaining <= 8) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">{session.spotsRemaining} spots left</span>;
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{session.spotsRemaining} spots left</span>;
};

export function SessionFeed() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = MOCK_SESSIONS.filter(session => {
    const q = searchQuery.toLowerCase();
    return session.venueName.toLowerCase().includes(q) || session.venueLocation.toLowerCase().includes(q);
  });

  // Group by date
  const groupedSessions = filteredSessions.reduce((acc, session) => {
    if (!acc[session.date]) {
      acc[session.date] = [];
    }
    acc[session.date].push(session);
    return acc;
  }, {} as Record<string, typeof MOCK_SESSIONS>);

  const sortedDates = Object.keys(groupedSessions).sort();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sessions</h1>
          </div>
          <p className="text-slate-500">Find and book your next badminton match.</p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm shadow-sm transition-all"
            placeholder="Search venues or locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Feed */}
        <div className="space-y-6">
          {sortedDates.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-4">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No sessions found</h3>
              <p className="mt-1 text-slate-500">Try adjusting your search terms.</p>
            </div>
          ) : (
            sortedDates.map((date) => {
              const dateSessions = groupedSessions[date];
              return (
                <div key={date} className="space-y-4">
                  
                  {/* Date Chip */}
                  <div className="flex items-center justify-center">
                    <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-slate-200/50 text-slate-600 text-sm font-medium shadow-sm border border-slate-200/50 backdrop-blur-sm">
                      {formatDate(date)} <span className="mx-2 text-slate-400">&middot;</span> {dateSessions.length} session{dateSessions.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Session Cards */}
                  <div className="space-y-3">
                    {dateSessions.map(session => {
                      const percentageBooked = (session.totalBookings / session.capacity) * 100;
                      
                      return (
                        <div 
                          key={session.id} 
                          className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row transition-all hover:shadow-md border-l-[3px] ${getLevelColor(session.level)}`}
                        >
                          {/* Left Side */}
                          <div className="flex-1 p-5">
                            <h3 className="font-semibold text-lg text-slate-900 truncate mb-3">{session.title}</h3>
                            
                            <div className="space-y-2 mb-4">
                              <div className="flex items-center text-slate-600 text-sm">
                                <Clock className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-800">{session.startTime} - {session.endTime}</span>
                              </div>
                              <div className="flex items-start text-slate-600 text-sm">
                                <MapPin className="w-4 h-4 mr-2 text-slate-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-1">{session.venueName} <span className="text-slate-400">&middot;</span> {session.venueLocation}</span>
                              </div>
                              <div className="flex items-center text-slate-600 text-sm">
                                <Users className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                <span>{session.courtCount} courts</span>
                              </div>
                            </div>

                            {/* Capacity Bar */}
                            <div className="mb-4">
                              <div className="flex justify-between text-xs text-slate-500 mb-1 font-medium">
                                <span>{session.totalBookings} / {session.capacity} joined</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${session.spotsRemaining === 0 ? 'bg-slate-400' : 'bg-indigo-500'}`} 
                                  style={{ width: \`\${Math.min(100, percentageBooked)}%\` }}
                                ></div>
                              </div>
                            </div>

                            <p className="text-sm text-slate-500 line-clamp-1">{session.description}</p>
                          </div>

                          {/* Right Side */}
                          <div className="shrink-0 sm:w-[180px] bg-slate-50/50 sm:border-l border-slate-100 p-5 flex flex-col justify-between items-center sm:items-stretch gap-4 border-t sm:border-t-0">
                            <div className="flex flex-col items-center justify-center flex-1">
                              <div className="mb-3 w-full text-center">
                                {getSpotsBadge(session)}
                              </div>
                              <div className="text-2xl font-bold text-slate-900 text-center">
                                {session.priceAed} <span className="text-sm font-normal text-slate-500">AED</span>
                              </div>
                            </div>
                            
                            <div className="w-full">
                              {session.userBooked ? (
                                <a href={`/marketplace/sessions/${session.id}`} className="block w-full py-2.5 px-4 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg text-sm text-center transition-colors shadow-sm">
                                  View Booking
                                </a>
                              ) : session.spotsRemaining === 0 ? (
                                <button disabled className="w-full py-2.5 px-4 bg-slate-100 text-slate-400 font-medium rounded-lg text-sm cursor-not-allowed opacity-60">
                                  View Details
                                </button>
                              ) : (
                                <a href={`/marketplace/sessions/${session.id}`} className="block w-full py-2.5 px-4 bg-indigo-600 text-white font-medium rounded-lg text-sm text-center shadow-sm flex items-center justify-center gap-1.5">
                                  View &amp; Book
                                  <ArrowRight className="w-4 h-4 opacity-70" />
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

export default SessionFeed;
