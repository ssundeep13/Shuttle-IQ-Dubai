import React from 'react';

const schedule = [
  { day: "MON", date: "APR 13", time: "8:00 PM", venue: "NEXT GENERATION SCHOOL" },
  { day: "TUE", date: "APR 14", time: "8:00 PM", venue: "PIONEERS BADMINTON HUB" },
  { day: "THU", date: "APR 16", time: "8:00 PM", venue: "SPRINGDALES SCHOOL DUBAI" },
  { day: "SAT", date: "APR 18", time: "6:00 PM", venue: "NEXT GENERATION SCHOOL" },
];

const TEAL = "#006B5F";
const DARK_NAVY = "#020812";

export function TypePoster() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: DARK_NAVY,
        color: "#ffffff",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "6vw",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Background Graphic Element - Massive IQ */}
      <div style={{
        position: "absolute",
        top: "-5vh",
        right: "-10vw",
        fontSize: "120vh",
        fontWeight: 900,
        color: "rgba(255,255,255,0.02)",
        lineHeight: 0.8,
        letterSpacing: "-0.05em",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0
      }}>
        Q
      </div>

      {/* Header */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "flex-start",
        zIndex: 10,
      }}>
        <div style={{ fontSize: "5vw", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
          Shuttle<span style={{ color: TEAL }}>IQ</span>
        </div>
        <div style={{ 
          fontSize: "2.5vw", 
          fontWeight: 600, 
          textAlign: "right", 
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: 0.9,
          lineHeight: 1.3
        }}>
          Weekly Sessions <br />
          <span style={{ color: TEAL, fontWeight: 800 }}>AED 50 / Session</span>
        </div>
      </div>

      {/* Schedule Container */}
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        zIndex: 10,
        gap: "4vw",
        marginTop: "8vw",
        marginBottom: "8vw"
      }}>
        {schedule.map((item, index) => (
          <div key={index} style={{
            display: "flex",
            alignItems: "center",
          }}>
            {/* Massive Day */}
            <div style={{
              fontSize: "22vw",
              fontWeight: 900,
              lineHeight: 0.75,
              letterSpacing: "-0.08em",
              color: index === 0 ? TEAL : "#ffffff",
              width: "45%",
              textTransform: "uppercase",
              textShadow: index === 0 ? `0 0 4vw rgba(0, 107, 95, 0.4)` : "none"
            }}>
              {item.day}
            </div>

            {/* Details */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              width: "55%",
              paddingLeft: "2vw",
              gap: "1vw"
            }}>
              <div style={{
                display: "flex",
                alignItems: "baseline",
                gap: "2.5vw"
              }}>
                <div style={{
                  fontSize: "5.5vw",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                }}>
                  {item.date} 
                </div>
                <div style={{ 
                  color: TEAL,
                  fontSize: "4.5vw",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}>
                  {item.time}
                </div>
              </div>
              
              <div style={{
                fontSize: "3vw",
                fontWeight: 500,
                letterSpacing: "0.02em",
                opacity: 0.7,
                textTransform: "uppercase",
              }}>
                {item.venue}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        zIndex: 10,
        borderTop: "0.4vw solid rgba(255,255,255,0.1)",
        paddingTop: "4vw"
      }}>
        <div style={{ 
          fontSize: "4vw", 
          fontWeight: 800, 
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
        }}>
          BOOK YOUR SPOT NOW
        </div>
        <div style={{ 
          fontSize: "3.5vw", 
          fontWeight: 800, 
          letterSpacing: "0.02em",
          backgroundColor: TEAL,
          color: "#ffffff",
          padding: "2vw 5vw",
          borderRadius: "100px",
          display: "inline-block",
          textTransform: "uppercase"
        }}>
          shuttleiq.org
        </div>
      </div>
    </div>
  );
}
