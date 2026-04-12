const schedule = [
  { day: "MON", date: "APR 13", time: "7:00 PM", venue: "Sports Hub — Hall A" },
  { day: "WED", date: "APR 15", time: "6:30 PM", venue: "Al Barsha Courts" },
  { day: "FRI", date: "APR 17", time: "8:00 PM", venue: "Sports Hub — Hall B" },
  { day: "SAT", date: "APR 18", time: "10:00 AM", venue: "Sports Hub — Hall A" },
];

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

      {/* Gradient overlay — dark at bottom, subtle at top */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,5,20,0.42) 0%, rgba(0,5,20,0.50) 30%, rgba(0,5,20,0.82) 58%, rgba(0,5,20,0.97) 100%)",
        }}
      />

      {/* Side vignette for depth */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,5,20,0.40) 100%)",
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.6vw" }}>
            {/* Shuttlecock icon */}
            <svg
              width="5.5vw"
              height="5.5vw"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="19" r="3" fill="#006B5F" />
              <path
                d="M12 16 C12 16, 6 10, 5 5 C9 6, 12 10, 12 16Z"
                fill="rgba(255,255,255,0.85)"
              />
              <path
                d="M12 16 C12 16, 18 10, 19 5 C15 6, 12 10, 12 16Z"
                fill="rgba(255,255,255,0.85)"
              />
              <path
                d="M12 16 C12 16, 8 8, 12 4 C16 8, 12 16, 12 16Z"
                fill="rgba(255,255,255,0.95)"
              />
              <line x1="5" y1="5" x2="19" y2="5" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
            </svg>
            <span
              style={{
                fontSize: "4.2vw",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              Shuttle
              <span style={{ color: "#00C9A7" }}>IQ</span>
            </span>
          </div>

          {/* "NEXT WEEK" badge */}
          <div
            style={{
              background: "#006B5F",
              color: "#ffffff",
              fontSize: "2.2vw",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "1vw 2.2vw",
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
              fontSize: "2.4vw",
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#00C9A7",
              marginBottom: "2vw",
            }}
          >
            Game Schedule
          </div>

          {/* Schedule rows */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {schedule.map((item, i) => (
              <div key={i}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "2.5vw",
                    paddingTop: "2vw",
                    paddingBottom: "2vw",
                  }}
                >
                  {/* Day + date block */}
                  <div style={{ minWidth: "14vw" }}>
                    <div
                      style={{
                        fontSize: "3.2vw",
                        fontWeight: 800,
                        color: "#ffffff",
                        lineHeight: 1,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {item.day}
                    </div>
                    <div
                      style={{
                        fontSize: "2vw",
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.55)",
                        letterSpacing: "0.06em",
                        marginTop: "0.4vw",
                      }}
                    >
                      {item.date}
                    </div>
                  </div>

                  {/* Vertical divider */}
                  <div
                    style={{
                      width: "1px",
                      height: "5vw",
                      background: "rgba(0,201,167,0.35)",
                      flexShrink: 0,
                    }}
                  />

                  {/* Time */}
                  <div
                    style={{
                      fontSize: "3vw",
                      fontWeight: 600,
                      color: "#ffffff",
                      minWidth: "16vw",
                      lineHeight: 1,
                    }}
                  >
                    {item.time}
                  </div>

                  {/* Venue */}
                  <div
                    style={{
                      fontSize: "2.6vw",
                      fontWeight: 400,
                      color: "rgba(255,255,255,0.62)",
                      lineHeight: 1.2,
                      flex: 1,
                    }}
                  >
                    {item.venue}
                  </div>
                </div>

                {/* Separator — not after last row */}
                {i < schedule.length - 1 && (
                  <div
                    style={{
                      height: "1px",
                      background:
                        "linear-gradient(to right, rgba(0,201,167,0.25) 0%, rgba(255,255,255,0.08) 80%, transparent 100%)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Bottom wordmark + fine print */}
          <div
            style={{
              marginTop: "3.5vw",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "2vw",
                fontWeight: 600,
                color: "rgba(255,255,255,0.35)",
                letterSpacing: "0.05em",
              }}
            >
              Shuttle<span style={{ color: "rgba(0,201,167,0.5)" }}>IQ</span>
            </span>
            <span
              style={{
                fontSize: "1.7vw",
                fontWeight: 400,
                color: "rgba(255,255,255,0.30)",
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
