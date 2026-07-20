// Gate FV.1a — shared avatar with a branded initials fallback. Renders the
// photo when present AND it loads; falls back to a navy initials circle on a
// null URL or an image load error (the pre-volume wipe left dead /uploads
// URLs that used to render broken images). No emoji, no icons.
import { useState, type CSSProperties } from 'react';

const FF_INTER = "'Inter', system-ui, sans-serif";
const NAVY = '#003E8C';

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Cache-buster for locally-hosted avatar URLs. Before the /uploads 404 fix,
 * misses served the SPA shell with maxAge 30d — browsers may hold that HTML
 * cached AS the image for up to a month, so same-URL refetches must be
 * forced. Google-hosted (and any absolute) URLs pass through untouched.
 */
export function avatarSrc(url: string): string {
  if (!url.startsWith('/uploads/')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'v=2';
}

export default function BrandAvatar({
  photoUrl,
  name,
  size,
  testid,
  style,
}: {
  photoUrl: string | null | undefined;
  name: string;
  size: number;
  testid?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <img
        src={avatarSrc(photoUrl)}
        alt={name}
        data-testid={testid}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flex: 'none', ...style }}
      />
    );
  }

  return (
    <div
      data-testid={testid ? `${testid}-fallback` : undefined}
      aria-label={name}
      style={{
        width: size, height: size, borderRadius: '50%', background: NAVY, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        fontFamily: FF_INTER, fontWeight: 600, fontSize: Math.round(size * 0.36), letterSpacing: '0.02em',
        ...style,
      }}
    >
      {initialsOf(name)}
    </div>
  );
}
