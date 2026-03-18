import React, { useState } from "react";
import {
  CalendarDays,
  Search,
  Clock,
  MapPin,
  Users,
  ChevronRight,
  Filter
} from "lucide-react";

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
    description:
      "All levels welcome. Seamless payment available online or via Careem Pay at the venue.",
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
    description:
      "All levels welcome. Seamless payment available online or via Careem Pay at the venue.",
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
    description:
      "Intermediate to advanced players only. High-intensity matches.",
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
    description:
      "Weekend open play. All skill levels, beginners especially welcome.",
    status: "upcoming",
    imageUrl: null,
  },
];

// Helper functions for dates
const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

const getLeftPanelDateInfo = (dateStr: string) => {
  const date = new Date(dateStr);
  return {
    dayAbbrev: date.toLocaleDateString("en-US", { weekday: "short" }),
    dayNumber: date.getDate(),
    monthAbbrev: date.toLocaleDateString("en-US", { month: "short" }),
  };
};

const generateDateStrip = () => {
  // Simple generator for dates (using the dates present in our mock data for convenience)
  const uniqueDates = Array.from(
    new Set(MOCK_SESSIONS.map((s) => s.date))
  ).sort();
  return uniqueDates.map((dateStr) => {
    const d = new Date(dateStr);
    return {
      dateStr,
      dayAbbrev: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNumber: d.getDate(),
      isToday: dateStr === "2026-03-26", // Mock today
    };
  });
};

export default function TimelineList() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const dateStrip = generateDateStrip();

  // Filter sessions
  const filteredSessions = MOCK_SESSIONS.filter((s) => {
    if (s.status !== "upcoming") return false;
    if (selectedDate && s.date !== selectedDate) return false;
    if (
      searchQuery &&
      !s.venueName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.venueLocation.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Group by date
  const groupedSessions = filteredSessions.reduce((acc, session) => {
    if (!acc[session.date]) {
      acc[session.date] = [];
    }
    acc[session.date].push(session);
    return acc;
  }, {} as Record<string, typeof MOCK_SESSIONS>);

  // Sort dates
  const sortedDates = Object.keys(groupedSessions).sort();

  return (
    <div className="min-h-screen bg-[#f5f0e8] text-gray-900 pb-20 font-sans">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-6 shadow-sm border-b border-gray-200">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="p-2 rounded-xl text-white flex items-center justify-center"
              style={{ background: "#0f2d5a" }}
            >
              <CalendarDays size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Sessions
            </h1>
          </div>
          <p className="text-gray-500 mb-6">
            Browse and book upcoming badminton sessions across Dubai
          </p>

          {/* Search Bar */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Search venues or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0f2d5a]/20 focus:border-[#0f2d5a] transition-all"
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-6">
        {/* Date Strip Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Filter by Date
          </h2>
          <button
            onClick={() => setSelectedDate(null)}
            className={`text-sm font-medium transition-colors ${
              selectedDate === null
                ? "text-[#0f2d5a] font-bold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            All Dates
          </button>
        </div>

        {/* Horizontal Date Strip */}
        <div className="flex overflow-x-auto pb-4 -mx-4 px-4 gap-3 no-scrollbar snap-x">
          {dateStrip.map((d) => {
            const isSelected = selectedDate === d.dateStr;
            const isToday = d.isToday;
            return (
              <button
                key={d.dateStr}
                onClick={() => setSelectedDate(d.dateStr)}
                className={`snap-start flex flex-col items-center justify-center min-w-[70px] py-3 rounded-2xl border transition-all ${
                  isSelected
                    ? "bg-[#0f2d5a] border-[#0f2d5a] text-white shadow-md transform scale-105"
                    : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`text-xs font-medium mb-1 ${
                    isSelected
                      ? "text-blue-200"
                      : isToday
                      ? "text-[#0f2d5a] font-bold"
                      : "text-gray-500"
                  }`}
                >
                  {isToday ? "Today" : d.dayAbbrev}
                </span>
                <span className="text-xl font-bold">{d.dayNumber}</span>
                {isToday && !isSelected && (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0f2d5a] mt-1"></div>
                )}
              </button>
            );
          })}
        </div>

        {/* Sessions List */}
        <div className="mt-6 space-y-10">
          {sortedDates.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Filter size={24} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                No sessions found
              </h3>
              <p className="text-gray-500">
                Try adjusting your search or date filters.
              </p>
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setSearchQuery("");
                }}
                className="mt-6 text-[#0f2d5a] font-medium hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            sortedDates.map((dateStr) => {
              const sessions = groupedSessions[dateStr];
              return (
                <div key={dateStr} className="space-y-4">
                  {/* Date Header */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm border border-gray-200 text-gray-500">
                      <CalendarDays size={16} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {formatDateHeader(dateStr)}
                    </h3>
                    <span className="ml-auto bg-gray-200 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                      {sessions.length} session{sessions.length !== 1 && "s"}
                    </span>
                  </div>

                  {/* Sessions for this date */}
                  <div className="space-y-4 pl-4 border-l-2 border-gray-200 ml-4">
                    {sessions.map((session) => {
                      const dateInfo = getLeftPanelDateInfo(session.date);

                      // Determine Badge logic
                      let badgeText = `${session.spotsRemaining} spots`;
                      let badgeClass = "bg-gray-100 text-gray-700";

                      if (session.id === "s1") {
                        badgeText = "Booked";
                        badgeClass = "bg-green-100 text-green-700";
                      } else if (session.spotsRemaining === 0) {
                        badgeText = "Full";
                        badgeClass = "bg-red-100 text-red-700";
                      } else if (session.spotsRemaining <= 5) {
                        badgeText = `${session.spotsRemaining} left`;
                        badgeClass = "bg-orange-100 text-orange-700";
                      }

                      const progressPercentage =
                        session.capacity > 0
                          ? (session.totalBookings / session.capacity) * 100
                          : 0;

                      return (
                        <div
                          key={session.id}
                          className="flex flex-col sm:flex-row rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 bg-white group cursor-pointer"
                        >
                          {/* Left Panel - Date */}
                          <div
                            className="sm:w-28 flex sm:flex-col items-center justify-center p-4 sm:p-0 flex-row gap-4 sm:gap-1"
                            style={{ background: "#0f2d5a" }}
                          >
                            <span className="text-blue-200 text-sm font-medium uppercase tracking-widest">
                              {dateInfo.dayAbbrev}
                            </span>
                            <span className="text-white text-3xl sm:text-4xl font-black leading-none">
                              {dateInfo.dayNumber}
                            </span>
                            <span className="text-blue-100 text-sm font-medium">
                              {dateInfo.monthAbbrev}
                            </span>
                          </div>

                          {/* Right Panel - Details */}
                          <div className="flex-1 p-5">
                            <div className="flex justify-between items-start mb-2 gap-4">
                              <h4 className="text-lg font-bold text-gray-900 leading-tight">
                                {session.title}
                              </h4>
                              <span
                                className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${badgeClass}`}
                              >
                                {badgeText}
                              </span>
                            </div>

                            <div className="space-y-2 mt-4">
                              <div className="flex items-center text-gray-600 text-sm">
                                <Clock size={16} className="mr-2 text-gray-400 shrink-0" />
                                <span className="font-medium">
                                  {session.startTime} - {session.endTime}
                                </span>
                              </div>

                              <div className="flex items-start text-gray-600 text-sm">
                                <MapPin size={16} className="mr-2 mt-0.5 text-gray-400 shrink-0" />
                                <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-x-1">
                                  <span>{session.venueName}</span>
                                  <span className="hidden sm:inline text-gray-300">·</span>
                                  <span className="text-gray-500">{session.venueLocation}</span>
                                  <a
                                    href={session.venueMapUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-teal-600 hover:text-teal-700 font-medium ml-0 sm:ml-1 mt-1 sm:mt-0"
                                  >
                                    View on Map
                                  </a>
                                </div>
                              </div>

                              <div className="flex items-center text-gray-600 text-sm">
                                <Users size={16} className="mr-2 text-gray-400 shrink-0" />
                                <span>{session.courtCount} courts</span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-4">
                              <div className="flex justify-between text-xs font-medium text-gray-500 mb-1.5">
                                <span>
                                  {session.totalBookings} / {session.capacity} booked
                                </span>
                                <span>{Math.round(progressPercentage)}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    progressPercentage >= 100
                                      ? "bg-red-500"
                                      : session.id === "s1"
                                      ? "bg-green-500"
                                      : "bg-[#0f2d5a]"
                                  }`}
                                  style={{ width: `${progressPercentage}%` }}
                                ></div>
                              </div>
                            </div>

                            <p className="mt-4 text-sm text-gray-500 line-clamp-2">
                              {session.description}
                            </p>

                            <div className="mt-5 pt-5 border-t border-gray-100 flex items-center justify-between">
                              <div className="text-xl font-black text-gray-900">
                                AED {session.priceAed}
                              </div>
                              {session.spotsRemaining === 0 && session.id !== "s1" ? (
                                <button
                                  disabled
                                  className="flex items-center px-5 py-2.5 rounded-xl bg-gray-100 text-gray-400 font-medium text-sm cursor-not-allowed opacity-60"
                                >
                                  View Details
                                  <ChevronRight size={16} className="ml-1" />
                                </button>
                              ) : (
                                <a
                                  href={`/marketplace/sessions/${session.id}`}
                                  className="flex items-center px-5 py-2.5 rounded-xl text-white font-medium text-sm"
                                  style={{ background: "#0f2d5a" }}
                                >
                                  {session.id === "s1" ? "View Booking" : "View & Book"}
                                  <ChevronRight size={16} className="ml-1" />
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
