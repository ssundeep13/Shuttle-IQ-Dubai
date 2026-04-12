import React from 'react';

const schedule = [
  { day: "MON", date: "APR 13", time: "8:00 PM", venue: "Next Generation School" },
  { day: "TUE", date: "APR 14", time: "8:00 PM", venue: "Pioneers Badminton Hub" },
  { day: "THU", date: "APR 16", time: "8:00 PM", venue: "Springdales School Dubai" },
  { day: "SAT", date: "APR 18", time: "6:00 PM", venue: "Next Generation School" },
];

const TEAL = "#006B5F";

export function TicketStrip() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#050810",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background image with heavy overlay */}
      <img
        src="/__mockup/images/badminton-hero.png"
        alt="Background"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.2,
          mixBlendMode: "luminosity"
        }}
      />

      <div style={{ 
        position: "relative", 
        zIndex: 10, 
        width: "88%", 
        height: "100%", 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "space-between", 
        padding: "8vw 0" 
      }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ fontSize: "6vw", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
            Shuttle<span style={{ color: TEAL }}>IQ</span>
          </div>
          <div style={{ fontSize: "3vw", fontWeight: 600, color: TEAL, textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Match Schedule
          </div>
        </div>

        {/* Tickets */}
        <div style={{ display: "flex", flexDirection: "column", gap: "3.5vw", marginTop: "2vw", marginBottom: "2vw" }}>
          {schedule.map((session, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                backgroundColor: "#0d1323",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.08)",
                overflow: "hidden",
                position: "relative",
                boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              }}
            >
              {/* Left stub (Date) */}
              <div
                style={{
                  backgroundColor: TEAL,
                  width: "28%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: "4vw 2vw",
                  borderRight: "3px dashed rgba(0,0,0,0.3)",
                  position: "relative",
                }}
              >
                {/* Cutouts */}
                <div style={{ position: "absolute", top: "-2.5vw", right: "-2.5vw", width: "5vw", height: "5vw", backgroundColor: "#050810", borderRadius: "50%" }}></div>
                <div style={{ position: "absolute", bottom: "-2.5vw", right: "-2.5vw", width: "5vw", height: "5vw", backgroundColor: "#050810", borderRadius: "50%" }}></div>

                <div style={{ fontSize: "3vw", fontWeight: 700, color: "#fff", opacity: 0.9, letterSpacing: "0.05em" }}>{session.day}</div>
                <div style={{ fontSize: "6vw", fontWeight: 900, color: "#fff", lineHeight: 1.1, textAlign: "center", letterSpacing: "-0.03em" }}>{session.date.split(" ")[1]}</div>
                <div style={{ fontSize: "2.5vw", fontWeight: 600, color: "#fff", opacity: 0.8, textTransform: "uppercase" }}>{session.date.split(" ")[0]}</div>
              </div>

              {/* Right main body (Details) */}
              <div
                style={{
                  flex: 1,
                  padding: "5vw 4vw",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  position: "relative",
                  background: "linear-gradient(90deg, #111827 0%, #0d1323 100%)"
                }}
              >
                <div style={{ fontSize: "4.8vw", fontWeight: 800, color: "#fff", marginBottom: "1.5vw", letterSpacing: "-0.01em" }}>
                  {session.time}
                </div>
                <div style={{ fontSize: "3.2vw", fontWeight: 500, color: "rgba(255,255,255,0.6)", lineHeight: 1.3, maxWidth: "80%" }}>
                  {session.venue}
                </div>
                
                <div style={{ 
                  position: "absolute", 
                  top: "5vw", 
                  right: "4vw", 
                  fontSize: "3vw", 
                  fontWeight: 800, 
                  color: "#fff", 
                  backgroundColor: "rgba(0,107,95,0.3)",
                  border: `1px solid ${TEAL}`, 
                  padding: "1vw 2.5vw", 
                  borderRadius: "30px",
                  letterSpacing: "0.02em"
                }}>
                  AED 50
                </div>

                {/* Decorative barcode-like element */}
                <div style={{
                  position: "absolute",
                  bottom: "4vw",
                  right: "4vw",
                  height: "4vw",
                  width: "12vw",
                  display: "flex",
                  gap: "0.4vw",
                  opacity: 0.3
                }}>
                  {[1, 3, 2, 4, 1, 2, 5, 2, 1, 3].map((w, i) => (
                    <div key={i} style={{ width: `${w}px`, height: "100%", backgroundColor: "#fff" }}></div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          gap: "2vw"
        }}>
          <div style={{
            backgroundColor: "#fff",
            color: "#050810",
            padding: "3.5vw 8vw",
            borderRadius: "50px",
            fontSize: "4.5vw",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}>
            Book Now at shuttleiq.org
          </div>
          <div style={{ fontSize: "3vw", fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>
            Spots fill fast. Grab your ticket.
          </div>
        </div>
      </div>
    </div>
  );
}
