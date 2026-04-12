import React from "react";

const NAVY = "#001830";
const TEAL = "#006B5F";
const TEAL_ACCENT = "#4ECDC4";

const features = [
  {
    icon: (
      <svg width="4.5vw" height="4.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </svg>
    ),
    title: "Book Instantly",
    description: "Browse sessions, pick your slot, pay online",
  },
  {
    icon: (
      <svg width="4.5vw" height="4.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </svg>
    ),
    title: "Live Rankings",
    description: "ELO-style skill rating that updates after every match",
  },
  {
    icon: (
      <svg width="4.5vw" height="4.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Smart Matchmaking",
    description: "Teams balanced automatically by skill level",
  },
  {
    icon: (
      <svg width="4.5vw" height="4.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: "Real-Time Queue",
    description: "See who's playing, know exactly when you're up",
  },
  {
    icon: (
      <svg width="4.5vw" height="4.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" x2="12" y1="20" y2="10" />
        <line x1="18" x2="18" y1="20" y2="4" />
        <line x1="6" x2="6" y1="20" y2="16" />
      </svg>
    ),
    title: "Player Stats",
    description: "Wins, games, win rate—all tracked for you",
  },
];

export function FeaturesPost() {
  return (
    <div
      style={{
        width: "100vw",
        height: "125vw",
        overflow: "hidden",
        position: "relative",
        background: NAVY,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top section: Hero Image & Header */}
      <div
        style={{
          flex: "0 0 38%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          padding: "6vw",
          justifyContent: "space-between",
        }}
      >
        {/* Background Hero */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "url(/__mockup/images/features-hero.png)",
            backgroundSize: "cover",
            backgroundPosition: "center 20%",
          }}
        />
        {/* Gradient overlays to wash into navy */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,24,48,0.2) 0%, rgba(0,24,48,0.9) 70%, #001830 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at top right, rgba(0,107,95,0.4) 0%, transparent 60%)",
          }}
        />

        {/* Logo Header */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "flex-start", alignItems: "center" }}>
          <span style={{ fontSize: "5vw", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1 }}>
            Shuttle<span style={{ color: TEAL }}>IQ</span>
          </span>
        </div>

        {/* Bridge Headline */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <span style={{ fontSize: "11vw", fontWeight: 900, color: "#ffffff", lineHeight: 1.1, letterSpacing: "-0.03em" }}>
            Your Game, <br />
            <span style={{ color: TEAL_ACCENT }}>Upgraded.</span>
          </span>
        </div>
      </div>

      {/* Features List Section */}
      <div
        style={{
          flex: "1",
          background: NAVY,
          padding: "2vw 6vw 6vw 6vw",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4.5vw", flex: 1, justifyContent: "center" }}>
          {features.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "4.5vw" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "10vw",
                  height: "10vw",
                  background: "rgba(78,205,196,0.1)",
                  borderRadius: "2.5vw",
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5vw" }}>
                <span style={{ fontSize: "4.5vw", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
                  {item.title}
                </span>
                <span style={{ fontSize: "3.2vw", fontWeight: 400, color: "rgba(255,255,255,0.6)", lineHeight: 1.3 }}>
                  {item.description}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: "6vw" }}>
          <div
            style={{
              background: TEAL,
              color: "#ffffff",
              padding: "3.5vw 8vw",
              borderRadius: "100px",
              fontSize: "3.8vw",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              boxShadow: `0 8px 24px ${TEAL}40`,
              width: "100%",
              textAlign: "center",
            }}
          >
            Join Now — shuttleiq.org
          </div>
        </div>
      </div>
    </div>
  );
}
