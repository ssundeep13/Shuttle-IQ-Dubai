export const schedule = [
  { day: "MON", date: "APR 13", time: "8:00 PM", venue: "Next Generation School" },
  { day: "TUE", date: "APR 14", time: "8:00 PM", venue: "Pioneers Badminton Hub" },
  { day: "THU", date: "APR 16", time: "8:00 PM", venue: "Springdales School Dubai" },
  { day: "SAT", date: "APR 18", time: "6:00 PM", venue: "Next Generation School" },
];

const TEAL = "#006B5F";
const TEAL_ACCENT = "#4ECDC4";
const NAVY = "#001830";

export function Spotlight() {
  const spotlight = schedule[0];
  const upcoming = schedule.slice(1);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: NAVY,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top section: Hero / Spotlight */}
      <div
        style={{
          flex: "1 1 65%",
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
            backgroundImage: "url(/__mockup/images/badminton-hero.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Gradients for text readability and blending into the bottom */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,24,48,0.3) 0%, rgba(0,24,48,0.8) 70%, #001830 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at top right, rgba(0,107,95,0.3) 0%, transparent 60%)",
          }}
        />

        {/* Header */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: "4.5vw", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1 }}>
            Shuttle<span style={{ color: TEAL }}>IQ</span>
          </span>
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", padding: "1.5vw 3.5vw", borderRadius: "100px", border: "1px solid rgba(255,255,255,0.15)" }}>
            <span style={{ fontSize: "2.5vw", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Next Game
            </span>
          </div>
        </div>

        {/* Spotlight Details */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "3vw" }}>
            <span style={{ fontSize: "16vw", fontWeight: 900, color: "#ffffff", lineHeight: 0.8, letterSpacing: "-0.04em", textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
              {spotlight.day}
            </span>
            <span style={{ fontSize: "6vw", fontWeight: 700, color: TEAL_ACCENT, letterSpacing: "0.02em" }}>
              {spotlight.date}
            </span>
          </div>
          <span style={{ fontSize: "8vw", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em", marginTop: "2vw" }}>
            {spotlight.time}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "2vw", marginTop: "2vw" }}>
            <svg width="4.5vw" height="4.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span style={{ fontSize: "4.5vw", fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>
              {spotlight.venue}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom section: Also Showing & CTA */}
      <div
        style={{
          flex: "1 1 35%",
          background: NAVY,
          padding: "0 6vw 6vw 6vw",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "3vw", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "3vw" }}>
            Also Showing
          </span>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "3vw" }}>
            {upcoming.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4vw" }}>
                  <span style={{ fontSize: "4.2vw", fontWeight: 800, color: "#ffffff", minWidth: "12vw" }}>{item.day}</span>
                  <span style={{ fontSize: "3.5vw", fontWeight: 500, color: "rgba(255,255,255,0.5)", minWidth: "14vw" }}>{item.date}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flex: 1, gap: "3vw" }}>
                  <span style={{ fontSize: "3.2vw", fontWeight: 500, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "35vw" }}>{item.venue}</span>
                  <span style={{ fontSize: "3.8vw", fontWeight: 700, color: "#ffffff", minWidth: "18vw", textAlign: "right" }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "5vw", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: "3.5vw", fontWeight: 500, color: "rgba(255,255,255,0.6)" }}>
            AED 50 / Session
          </span>
          <div style={{ background: TEAL, color: "#ffffff", padding: "2.8vw 7vw", borderRadius: "100px", fontSize: "3.5vw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", boxShadow: `0 8px 24px ${TEAL}40` }}>
            shuttleiq.org
          </div>
        </div>
      </div>
    </div>
  );
}
