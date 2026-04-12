const schedule = [
  { day: "MON", date: "APR 13", time: "8:00 PM", venue: "Next Generation School" },
  { day: "TUE", date: "APR 14", time: "8:00 PM", venue: "Pioneers Badminton Hub" },
  { day: "THU", date: "APR 16", time: "8:00 PM", venue: "Springdales School Dubai" },
  { day: "SAT", date: "APR 18", time: "6:00 PM", venue: "Next Generation School" },
];

const TEAL = "#006B5F";
const TEAL_ACCENT = "#4ECDC4";
const NAVY = "#003E8C";

export function SchedulePost() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#001830",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Hero image — full bleed */}
      <img
        src="/__mockup/images/badminton-hero.png"
        alt="Badminton court"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,5,20,0.38) 0%, rgba(0,5,20,0.50) 30%, rgba(0,5,20,0.82) 58%, rgba(0,5,20,0.97) 100%)",
        }}
      />

      {/* Side vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,5,20,0.38) 100%)",
        }}
      />

      {/* Content layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          padding: "5.5vw",
        }}
      >
        {/* Top row: logo + badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          {/* Logo — wordmark only */}
          <span
            style={{
              fontSize: "4.4vw",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Shuttle<span style={{ color: TEAL }}>IQ</span>
          </span>

        </div>

        {/* Middle spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom section */}
        <div>
          {/* Section label */}
          <div
            style={{
              fontSize: "2.3vw",
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: TEAL_ACCENT,
              marginBottom: "2.2vw",
            }}
          >
            Game Schedule
          </div>

          {/* Schedule rows — single line each */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {schedule.map((item, i) => (
              <div key={i}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingTop: "2vw",
                    paddingBottom: "2vw",
                    gap: 0,
                  }}
                >
                  {/* Day */}
                  <span
                    style={{
                      fontSize: "3.2vw",
                      fontWeight: 800,
                      color: "#ffffff",
                      letterSpacing: "0.04em",
                      minWidth: "8vw",
                    }}
                  >
                    {item.day}
                  </span>

                  {/* · Date */}
                  <span
                    style={{
                      fontSize: "2.6vw",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.55)",
                      letterSpacing: "0.04em",
                      marginRight: "3vw",
                    }}
                  >
                    · {item.date}
                  </span>

                  {/* Time */}
                  <span
                    style={{
                      fontSize: "3vw",
                      fontWeight: 600,
                      color: "#ffffff",
                      minWidth: "17vw",
                    }}
                  >
                    {item.time}
                  </span>

                  {/* Thin teal pipe */}
                  <span
                    style={{
                      color: `${TEAL}`,
                      fontSize: "2.5vw",
                      fontWeight: 300,
                      marginRight: "2.5vw",
                      opacity: 0.6,
                    }}
                  >
                    |
                  </span>

                  {/* Venue */}
                  <span
                    style={{
                      fontSize: "2.6vw",
                      fontWeight: 400,
                      color: "rgba(255,255,255,0.62)",
                      flex: 1,
                    }}
                  >
                    {item.venue}
                  </span>
                </div>

                {/* Separator */}
                {i < schedule.length - 1 && (
                  <div
                    style={{
                      height: "1px",
                      background:
                        `linear-gradient(to right, rgba(0,107,95,0.4) 0%, rgba(255,255,255,0.08) 70%, transparent 100%)`,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Bottom: centered wordmark + fine print */}
          <div
            style={{
              marginTop: "3.5vw",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.7vw",
            }}
          >
            <span
              style={{
                fontSize: "2.1vw",
                fontWeight: 700,
                color: "rgba(255,255,255,0.38)",
                letterSpacing: "0.08em",
              }}
            >
              Shuttle<span style={{ color: `rgba(0,107,95,0.6)` }}>IQ</span>
            </span>
            <span
              style={{
                fontSize: "1.7vw",
                fontWeight: 400,
                color: "rgba(255,255,255,0.28)",
                letterSpacing: "0.04em",
              }}
            >
              shuttleiq.app · Book your spot
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
