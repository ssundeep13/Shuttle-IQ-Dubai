const schedule = [
  { day: "MON", date: "APR 13", time: "7:00 PM", venue: "Sports Hub — Hall A" },
  { day: "WED", date: "APR 15", time: "6:30 PM", venue: "Al Barsha Courts" },
  { day: "FRI", date: "APR 17", time: "8:00 PM", venue: "Sports Hub — Hall B" },
  { day: "SAT", date: "APR 18", time: "10:00 AM", venue: "Sports Hub — Hall A" },
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
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw" }}>
            <svg
              width="5.5vw"
              height="5.5vw"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="19.5" r="2.8" fill={TEAL} />
              <path d="M12 16.5 C12 16.5, 5.5 9, 4.5 4 C9 5.5, 12 10.5, 12 16.5Z" fill="rgba(255,255,255,0.85)" />
              <path d="M12 16.5 C12 16.5, 18.5 9, 19.5 4 C15 5.5, 12 10.5, 12 16.5Z" fill="rgba(255,255,255,0.85)" />
              <path d="M12 16.5 C12 16.5, 8 7.5, 12 3.5 C16 7.5, 12 16.5, 12 16.5Z" fill="rgba(255,255,255,0.96)" />
              <line x1="4.5" y1="4" x2="19.5" y2="4" stroke="rgba(255,255,255,0.55)" strokeWidth="0.5" />
            </svg>
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

          {/* "NEXT WEEK" badge */}
          <div
            style={{
              background: TEAL,
              color: "#ffffff",
              fontSize: "2.1vw",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "1vw 2.4vw",
              borderRadius: "99px",
              lineHeight: 1,
            }}
          >
            Next Week
          </div>
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
