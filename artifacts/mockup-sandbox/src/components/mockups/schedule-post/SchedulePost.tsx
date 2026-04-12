const schedule = [
  { day: "MON", date: "APR 13", time: "8:00 PM", venue: "Next Generation School" },
  { day: "TUE", date: "APR 14", time: "8:00 PM", venue: "Pioneers Badminton Hub" },
  { day: "THU", date: "APR 16", time: "8:00 PM", venue: "Springdales School Dubai" },
  { day: "SAT", date: "APR 18", time: "6:00 PM", venue: "Next Generation School" },
];

const TEAL = "#006B5F";
const TEAL_ACCENT = "#4ECDC4";
const NAVY = "#001830";

export function SchedulePost() {
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
          flex: "0 0 52%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          padding: "5.5vw",
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
            background: "radial-gradient(circle at top right, rgba(0,107,95,0.25) 0%, transparent 60%)",
          }}
        />

        {/* Header */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: "4.4vw", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1 }}>
            Shuttle<span style={{ color: TEAL }}>IQ</span>
          </span>
          <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", padding: "1.2vw 3vw", borderRadius: "100px", border: "1px solid rgba(255,255,255,0.15)" }}>
            <span style={{ fontSize: "2.2vw", fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Next Game
            </span>
          </div>
        </div>

        {/* Spotlight Details */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "2vw" }}>
            <span style={{ fontSize: "15vw", fontWeight: 900, color: "#ffffff", lineHeight: 0.85, letterSpacing: "-0.04em", textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
              {spotlight.day}
            </span>
            <span style={{ fontSize: "5.5vw", fontWeight: 700, color: TEAL_ACCENT, letterSpacing: "0.02em" }}>
              {spotlight.date}
            </span>
          </div>
          <span style={{ fontSize: "7vw", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.02em", marginTop: "1.5vw" }}>
            {spotlight.time}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw", marginTop: "1.5vw" }}>
            <svg width="3.5vw" height="3.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span style={{ fontSize: "3.8vw", fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
              {spotlight.venue}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom section: Also Showing & CTA */}
      <div
        style={{
          flex: "0 0 48%",
          background: NAVY,
          padding: "3vw 5.5vw 5vw 5.5vw",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "2.4vw", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: "2.5vw" }}>
            Also This Week
          </span>

          <div style={{ display: "flex", flexDirection: "column", gap: "2.2vw" }}>
            {upcoming.map((item, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", gap: "3vw" }}>
                  <span style={{ fontSize: "3.8vw", fontWeight: 800, color: "#ffffff", minWidth: "10vw" }}>{item.day}</span>
                  <span style={{ fontSize: "3vw", fontWeight: 500, color: "rgba(255,255,255,0.45)", minWidth: "13vw" }}>{item.date}</span>
                  <span style={{ fontSize: "2.8vw", fontWeight: 400, color: "rgba(255,255,255,0.6)", flex: 1 }}>{item.venue}</span>
                  <span style={{ fontSize: "3.4vw", fontWeight: 700, color: "#ffffff" }}>{item.time}</span>
                </div>
                {i < upcoming.length - 1 && (
                  <div
                    style={{
                      height: "1px",
                      marginTop: "2.2vw",
                      background: "linear-gradient(to right, rgba(0,107,95,0.3) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "3vw", marginTop: "3.5vw", paddingTop: "3.5vw", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5vw" }}>
            <span style={{ fontSize: "3.2vw", fontWeight: 700, color: "#ffffff" }}>
              AED 50
            </span>
            <span style={{ fontSize: "2vw", fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>
              per session
            </span>
          </div>
          <div style={{ background: TEAL, color: "#ffffff", padding: "2.5vw 6vw", borderRadius: "100px", fontSize: "3.2vw", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", boxShadow: `0 6px 20px ${TEAL}40` }}>
            Book Now — shuttleiq.org
          </div>
        </div>
      </div>
    </div>
  );
}
