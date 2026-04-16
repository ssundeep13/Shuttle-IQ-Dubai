export function GameDay() {
  return (
    <div style={{
      width: 1080,
      height: 1080,
      background: 'linear-gradient(145deg, #001830 0%, #003E8C 50%, #006B5F 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '60px 50px',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.04,
        backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
        backgroundSize: '28px 28px',
      }} />

      <div style={{
        position: 'absolute',
        top: -120,
        right: -120,
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'rgba(78, 205, 196, 0.08)',
        filter: 'blur(60px)',
      }} />

      <div style={{
        position: 'absolute',
        bottom: -80,
        left: -80,
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: 'rgba(0, 62, 140, 0.15)',
        filter: 'blur(50px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', width: '100%' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(78, 205, 196, 0.15)',
          border: '1px solid rgba(78, 205, 196, 0.3)',
          borderRadius: 24,
          padding: '8px 20px',
          marginBottom: 24,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#4ECDC4', letterSpacing: 2, textTransform: 'uppercase' }}>
            Tonight's Session
          </span>
        </div>

        <h1 style={{
          fontSize: 64,
          fontWeight: 800,
          color: 'white',
          margin: '0 0 8px 0',
          lineHeight: 1.1,
          letterSpacing: -1,
        }}>
          Game Day
        </h1>
        <p style={{
          fontSize: 22,
          color: 'rgba(255,255,255,0.6)',
          margin: 0,
          fontWeight: 500,
        }}>
          Thursday, April 16
        </p>
      </div>

      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '36px 40px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 28,
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(78, 205, 196, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>
              Springdales School Dubai
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>
              Al Quoz Fourth, Al Quoz, Dubai
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 16,
        }}>
          {[
            { label: 'Time', value: '8 – 10 PM', icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            )},
            { label: 'Courts', value: '3 Courts', icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 12h18" />
              </svg>
            )},
            { label: 'Price', value: 'AED 49', icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            )},
          ].map((item, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 14,
              padding: '18px 16px',
              textAlign: 'center',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                {item.icon}
              </div>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>{item.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 16,
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#4ECDC4',
            animation: 'pulse 2s infinite',
          }} />
          <span style={{ fontSize: 16, color: '#4ECDC4', fontWeight: 600 }}>
            2 spots remaining
          </span>
        </div>

        <div style={{
          background: '#4ECDC4',
          borderRadius: 16,
          padding: '18px 40px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#001830' }}>
            Book Now at shuttleiq.org
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001830" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </div>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'white',
            letterSpacing: -0.5,
          }}>
            Shuttle<span style={{ color: '#4ECDC4' }}>IQ</span>
          </span>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>@shuttleiq</span>
        </div>
      </div>
    </div>
  );
}
