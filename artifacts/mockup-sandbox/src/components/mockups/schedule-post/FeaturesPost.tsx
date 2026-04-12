export function FeaturesPost() {
  const NAVY = "#001830";
  const TEAL = "#006B5F";
  const TEAL_ACCENT = "#4ECDC4";
  const WHITE = "#ffffff";
  const DIM = "rgba(255,255,255,0.55)";
  const CARD_BG = "#0d2440";
  const CARD_BORDER = "rgba(78,205,196,0.15)";

  const PodiumCard = ({ rank, name, score, tier, tierColor, borderColor, medalColor, isCenter }: {
    rank: number; name: string; score: number; tier: string; tierColor: string; borderColor: string; medalColor: string; isCenter?: boolean;
  }) => (
    <div style={{
      background: CARD_BG,
      border: `${isCenter ? "2px" : "1px"} solid ${borderColor}`,
      borderRadius: "2.2vw",
      padding: isCenter ? "2.5vw 1.5vw 2vw" : "2vw 1.2vw 1.5vw",
      textAlign: "center" as const,
      flex: 1,
      marginTop: isCenter ? "-1.5vw" : 0,
      position: "relative" as const,
    }}>
      <div style={{
        width: isCenter ? "6vw" : "5vw",
        height: isCenter ? "6vw" : "5vw",
        borderRadius: "50%",
        background: `${medalColor}18`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 1vw",
      }}>
        <svg width={isCenter ? "3.2vw" : "2.5vw"} height={isCenter ? "3.2vw" : "2.5vw"} viewBox="0 0 24 24" fill="none" stroke={medalColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15" />
          <path d="M11 12 5.12 2.2" /><path d="m13 12 5.88-9.8" />
          <path d="M8 7h8" /><circle cx="12" cy="17" r="5" />
          <path d="M12 18v-2h-.5" />
        </svg>
      </div>
      <div style={{ fontSize: "1.8vw", fontWeight: 800, color: medalColor, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
        #{rank}
      </div>
      <div style={{ fontSize: "2.4vw", fontWeight: 700, color: WHITE, marginTop: "0.5vw", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </div>
      <div style={{ fontSize: isCenter ? "5.5vw" : "4.5vw", fontWeight: 900, color: WHITE, letterSpacing: "-0.04em", lineHeight: 1.1, marginTop: "0.3vw" }}>
        {score}
      </div>
      <div style={{ fontSize: "1.6vw", color: DIM, marginTop: "0.2vw" }}>pts</div>
      <div style={{
        display: "inline-block",
        marginTop: "1vw",
        padding: "0.4vw 1.5vw",
        borderRadius: "1vw",
        fontSize: "1.6vw",
        fontWeight: 700,
        color: tierColor,
        background: `${tierColor}15`,
        border: `1px solid ${tierColor}30`,
        letterSpacing: "0.04em",
        textTransform: "uppercase" as const,
      }}>
        {tier}
      </div>
    </div>
  );

  const LeaderboardRow = ({ rank, name, score, tier, tierColor }: {
    rank: number; name: string; score: number; tier: string; tierColor: string;
  }) => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "1.8vw",
      padding: "1.5vw 2.5vw",
      borderBottom: `1px solid ${CARD_BORDER}`,
    }}>
      <span style={{ fontSize: "2.2vw", fontWeight: 600, color: DIM, width: "3vw", textAlign: "center" as const }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "2.3vw", fontWeight: 600, color: WHITE, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        <span style={{
          fontSize: "1.5vw",
          fontWeight: 700,
          color: tierColor,
          background: `${tierColor}15`,
          border: `1px solid ${tierColor}30`,
          padding: "0.2vw 1vw",
          borderRadius: "0.8vw",
          letterSpacing: "0.03em",
          textTransform: "uppercase" as const,
        }}>{tier}</span>
      </div>
      <span style={{ fontSize: "2.8vw", fontWeight: 800, color: WHITE }}>{score}</span>
      <span style={{ fontSize: "1.5vw", color: DIM }}>pts</span>
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
                padding: "2vw 3vw 1.5vw",
              }}>
                <svg width="3vw" height="3vw" viewBox="0 0 24 24" fill="none" stroke={TEAL_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
                <span style={{ fontSize: "2.8vw", fontWeight: 800, color: WHITE }}>Rankings</span>
              </div>

              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "1vw",
                padding: "0 3vw 1.5vw",
              }}>
                {["All Time", "Month", "Week"].map((t, i) => (
                  <div key={t} style={{
                    padding: "0.6vw 2vw",
                    borderRadius: "1vw",
                    fontSize: "1.8vw",
                    fontWeight: 700,
                    background: i === 0 ? TEAL : "transparent",
                    color: i === 0 ? WHITE : DIM,
                    border: i === 0 ? "none" : `1px solid rgba(255,255,255,0.1)`,
                  }}>{t}</div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "1.5vw", padding: "0 2.5vw", alignItems: "flex-end" }}>
                <PodiumCard rank={2} name="Sarah K." score={142} tier="Advanced" tierColor="#6B8FD4" borderColor="rgba(255,255,255,0.08)" medalColor="rgba(255,255,255,0.4)" />
                <PodiumCard rank={1} name="Nikhil R." score={168} tier="Pro" tierColor={TEAL_ACCENT} borderColor={TEAL} medalColor={TEAL_ACCENT} isCenter />
                <PodiumCard rank={3} name="Arjun M." score={131} tier="Competitive" tierColor="#D4A56B" borderColor="rgba(255,255,255,0.08)" medalColor="rgba(255,255,255,0.4)" />
              </div>

              <div style={{ flex: 1, marginTop: "1.5vw", overflow: "hidden" }}>
                <LeaderboardRow rank={4} name="Aditya K." score={128} tier="Advanced" tierColor="#6B8FD4" />
                <LeaderboardRow rank={5} name="Sneha P." score={119} tier="Competitive" tierColor="#D4A56B" />
                <LeaderboardRow rank={6} name="Hamza T." score={115} tier="Intermediate" tierColor={TEAL} />
                <LeaderboardRow rank={7} name="Rizwan A." score={108} tier="Intermediate" tierColor={TEAL} />
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
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <span style={{ fontSize: "3vw", fontWeight: 800, color: WHITE, letterSpacing: "-0.01em" }}>
              Live Rankings
            </span>
            <span style={{ fontSize: "2.2vw", color: DIM }}>
              — ELO skill ratings updated every match
            </span>
          </div>

          <div style={{
            background: TEAL,
            color: WHITE,
            padding: "3vw 0",
            borderRadius: "100px",
            fontSize: "3.5vw",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            boxShadow: `0 1vw 4vw ${TEAL}50`,
            width: "100%",
            textAlign: "center",
          }}>
            Join Now — shuttleiq.org
          </div>
        </div>
      </div>
    </div>
  );
}
