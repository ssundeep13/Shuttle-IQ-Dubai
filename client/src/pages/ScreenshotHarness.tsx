import { useEffect, useState } from 'react';

export default function ScreenshotHarness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const refresh = params.get('refresh');
    if (token) localStorage.setItem('mp_accessToken', token);
    if (refresh) localStorage.setItem('mp_refreshToken', refresh);
    setReady(true);
  }, []);

  if (!ready) return null;

  const params = new URLSearchParams(window.location.search);
  const path = params.get('path') || '/marketplace';
  const w = parseInt(params.get('w') || '390', 10);
  const h = parseInt(params.get('h') || '844', 10);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0B1E38',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        margin: 0,
      }}
    >
      <div
        style={{
          width: `${w}px`,
          height: `${h}px`,
          borderRadius: '32px',
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 8px #1a1a1a, 0 0 0 9px #333',
        }}
      >
        <iframe
          src={path}
          title="preview"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          data-testid="iframe-preview"
          onLoad={(e) => {
            const scrollY = parseInt(params.get('scrollY') || '0', 10);
            const scrollSelector = params.get('scrollTo');
            const win = (e.target as HTMLIFrameElement).contentWindow;
            if (!win) return;
            setTimeout(() => {
              try {
                if (scrollSelector) {
                  const el = win.document.querySelector(scrollSelector);
                  if (el) el.scrollIntoView({ block: 'start' });
                } else if (scrollY) {
                  win.scrollTo(0, scrollY);
                }
              } catch {
                // cross-origin or missing element — ignore
              }
            }, 1200);
          }}
        />
      </div>
    </div>
  );
}
