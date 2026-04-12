export function FeaturesPost() {
  const NAVY = "#001830";
  const TEAL = "#006B5F";
  const TEAL_ACCENT = "#4ECDC4";
  const WHITE = "#ffffff";
  const DIM = "rgba(255,255,255,0.55)";
  const CARD_BG = "#0d2440";
  const CARD_BORDER = "rgba(78,205,196,0.15)";

  const StatCard = ({ value, label, icon, accent }: {
    value: string; label: string; icon: React.ReactNode; accent?: boolean;
  }) => (
    <div style={{
      background: accent ? "rgba(78,205,196,0.08)" : CARD_BG,
      border: `1px solid ${accent ? "rgba(78,205,196,0.25)" : CARD_BORDER}`,
      borderRadius: "1.8vw",
      padding: "1.8vw 2vw",
      display: "flex",
      flexDirection: "column" as const,
    }}>
      <div style={{
        width: "4vw",
        height: "4vw",
        borderRadius: "1vw",
        background: accent ? "rgba(78,205,196,0.15)" : "rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "1.2vw",
      }}>
        {icon}
      </div>
      <div style={{ fontSize: "4.5vw", fontWeight: 900, color: WHITE, letterSpacing: "-0.04em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: "1.5vw", color: DIM, marginTop: "0.4vw", fontWeight: 400 }}>
        {label}
      </div>
    </div>
  );

  const FeatureCallout = ({ icon, title, desc, side }: {
    icon: React.ReactNode; title: string; desc: string; side: "left" | "right";
  }) => (
    <div style={{
      display: "flex",
      flexDirection: side === "left" ? "row" as const : "row-reverse" as const,
      alignItems: "center",
      gap: "2vw",
      textAlign: side === "left" ? "left" as const : "right" as const,
    }}>
      <div style={{
        width: "7.5vw",
        height: "7.5vw",
        borderRadius: "2vw",
        background: `${TEAL_ACCENT}12`,
        border: `1px solid ${TEAL_ACCENT}25`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "2.8vw", fontWeight: 800, color: WHITE, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: "2vw", color: DIM, lineHeight: 1.3, marginTop: "0.3vw" }}>{desc}</div>
      </div>
    </div>
  );

  const iconProps = { width: "3.5vw", height: "3.5vw", viewBox: "0 0 24 24", fill: "none", stroke: TEAL_ACCENT, strokeWidth: "2", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <div style={{
      width: "100vw",
      height: "125vw",
      overflow: "hidden",
      position: "relative",
      background: NAVY,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 30%, ${TEAL}20 0%, transparent 60%)` }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%", backgroundImage: "url(/__mockup/images/features-hero.png)", backgroundSize: "cover", backgroundPosition: "center 20%", opacity: 0.08 }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%" }}>

        <div style={{ padding: "5vw 6vw 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "4.5vw", fontWeight: 700, color: WHITE, letterSpacing: "-0.02em" }}>
            Shuttle<span style={{ color: TEAL }}>IQ</span>
          </span>
          <span style={{ fontSize: "2vw", fontWeight: 600, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Badminton. Elevated.
          </span>
        </div>

        <div style={{ textAlign: "center", padding: "3vw 6vw 2vw" }}>
          <div style={{ fontSize: "8vw", fontWeight: 900, color: WHITE, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            Your Game,
          </div>
          <div style={{ fontSize: "8vw", fontWeight: 900, color: TEAL_ACCENT, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            Upgraded.
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", position: "relative", padding: "0 3vw" }}>

          <div style={{
            position: "absolute",
            left: "3vw",
            top: "2vw",
            width: "24vw",
            display: "flex",
            flexDirection: "column",
            gap: "5vw",
            zIndex: 3,
          }}>
            <FeatureCallout
              side="left"
              title="Book Instantly"
              desc="Browse & pay online"
              icon={<svg {...iconProps}><rect width="18" height="18" x="3" y="4" rx="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>}
            />
            <FeatureCallout
              side="left"
              title="Smart Match"
              desc="Skill-balanced teams"
              icon={<svg {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            />
          </div>

          <div style={{
            position: "absolute",
            right: "3vw",
            top: "2vw",
            width: "24vw",
            display: "flex",
            flexDirection: "column",
            gap: "5vw",
            zIndex: 3,
          }}>
            <FeatureCallout
              side="right"
              title="Live Queue"
              desc="Know when you're up"
              icon={<svg {...iconProps}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            />
            <FeatureCallout
              side="right"
              title="Player Stats"
              desc="Every win tracked"
              icon={<svg {...iconProps}><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></svg>}
            />
          </div>

          <div style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 0,
            width: "48vw",
            height: "78vw",
            zIndex: 2,
          }}>
            <div style={{
              width: "100%",
              height: "100%",
              background: "#0a1e35",
              borderRadius: "4vw",
              border: `2px solid rgba(78,205,196,0.2)`,
              overflow: "hidden",
              boxShadow: `0 4vw 10vw rgba(0,0,0,0.6), 0 0 8vw ${TEAL}15`,
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                width: "12vw",
                height: "0.6vw",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "1vw",
                margin: "1.2vw auto 0",
              }} />

              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.2vw",
                padding: "2vw 3vw 1vw",
              }}>
                <svg width="2.5vw" height="2.5vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" />
                </svg>
                <span style={{ fontSize: "2.5vw", fontWeight: 800, color: WHITE }}>My Scores</span>
              </div>

              <div style={{
                margin: "0 2.5vw",
                borderRadius: "2vw",
                padding: "2vw 2.5vw",
                background: "linear-gradient(135deg, #0f2b46 0%, #163a5f 50%, #1a4a6e 100%)",
                display: "flex",
                alignItems: "center",
                gap: "2vw",
              }}>
                <div style={{
                  width: "7vw",
                  height: "7vw",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.15)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "3vw",
                  fontWeight: 700,
                  color: WHITE,
                  flexShrink: 0,
                }}>N</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "2.8vw", fontWeight: 800, color: WHITE }}>Nikhil R.</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginTop: "0.4vw", flexWrap: "wrap" as const }}>
                    <span style={{
                      background: "rgba(0,107,95,0.7)",
                      color: WHITE,
                      padding: "0.3vw 1.2vw",
                      borderRadius: "0.6vw",
                      fontSize: "1.5vw",
                      fontWeight: 700,
                    }}>SIQ-00229</span>
                    <span style={{ fontSize: "1.6vw", color: "rgba(255,255,255,0.6)" }}>M · Professional (168)</span>
                  </div>
                  <div style={{ marginTop: "0.6vw" }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5vw",
                      fontSize: "1.4vw",
                      padding: "0.3vw 1.2vw",
                      borderRadius: "100px",
                      background: "rgba(34,197,94,0.15)",
                      color: "#4ade80",
                    }}>
                      <svg width="1.4vw" height="1.4vw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                      Rising (72% recent)
                    </span>
                  </div>
                </div>
                <div style={{
                  width: "9vw",
                  height: "9vw",
                  borderRadius: "50%",
                  background: TEAL,
                  border: `1.5px solid ${TEAL_ACCENT}`,
                  display: "flex",
                  flexDirection: "column" as const,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: "3.2vw", fontWeight: 800, color: WHITE, lineHeight: 1 }}>168</span>
                  <span style={{ fontSize: "1.2vw", color: "rgba(153,246,228,0.8)" }}>pts</span>
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5vw",
                padding: "2vw 2.5vw 0",
              }}>
                <StatCard
                  value="47"
                  label="Games Played"
                  icon={<svg width="2vw" height="2vw" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="22" x2="18" y1="12" y2="12" /><line x1="6" x2="2" y1="12" y2="12" /><line x1="12" x2="12" y1="6" y2="2" /><line x1="12" x2="12" y1="22" y2="18" /></svg>}
                />
                <StatCard
                  value="31"
                  label="Total Wins"
                  icon={<svg width="2vw" height="2vw" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>}
                />
                <StatCard
                  value="66%"
                  label="Win Rate"
                  accent
                  icon={<svg width="2vw" height="2vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>}
                />
                <StatCard
                  value="#3"
                  label="Skill Rank"
                  icon={<svg width="2vw" height="2vw" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></svg>}
                />
              </div>

              <div style={{
                margin: "2vw 2.5vw 0",
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: "1.8vw",
                padding: "2vw 2.5vw",
              }}>
                <div style={{ fontSize: "1.8vw", fontWeight: 700, color: WHITE, marginBottom: "1.5vw" }}>Skill Progression</div>
                <svg width="100%" height="12vw" viewBox="0 0 200 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={TEAL_ACCENT} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={TEAL_ACCENT} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 40 Q20 38 40 35 T80 28 T120 22 T160 18 T200 10" fill="none" stroke={TEAL_ACCENT} strokeWidth="1.5" />
                  <path d="M0 40 Q20 38 40 35 T80 28 T120 22 T160 18 T200 10 L200 50 L0 50 Z" fill="url(#chartGrad)" />
                  {[[0,40],[40,35],[80,28],[120,22],[160,18],[200,10]].map(([cx,cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r="2.5" fill={i % 3 === 0 ? "#4ade80" : TEAL_ACCENT} stroke="#0a1e35" strokeWidth="1" />
                  ))}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.8vw" }}>
                  {["Mar", "Apr", "May", "Jun", "Jul", "Aug"].map(m => (
                    <span key={m} style={{ fontSize: "1.2vw", color: DIM }}>{m}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          position: "relative",
          zIndex: 4,
          padding: "0 6vw 5vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2vw",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1.5vw",
            marginBottom: "0.5vw",
          }}>
            <svg width="3vw" height="3vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" />
            </svg>
            <span style={{ fontSize: "3vw", fontWeight: 800, color: WHITE, letterSpacing: "-0.01em" }}>
              Your Player Profile
            </span>
            <span style={{ fontSize: "2.2vw", color: DIM }}>
              — stats, rankings & skill progression
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
