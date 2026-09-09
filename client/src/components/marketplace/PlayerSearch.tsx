// Feed Gate 3 — player search. A debounced typeahead over the locked
// GET /api/marketplace/search-players (name + ShuttleIQ id only, five keys,
// ten results). Mounted above the filter chips on the Community feed and the
// Rankings page.
//
// Rules: nothing is sent under two characters; one request per settled query
// (300ms); rows are PlayerLinks to the public profile showing the tier DISPLAY
// label (never the DB enum); "No players found." on an empty hit; on 401
// (Rankings is public, the endpoint is not) the list offers "Sign in to search
// players"; Escape or a tap outside closes the list and keeps the typed text.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Search } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { MKT, FF_BODY } from '@/pages/marketplace/LandingComponents';
import { PlayerLink } from '@/components/marketplace/PlayerLink';

export const PLAYER_SEARCH_DEBOUNCE_MS = 300;
export const PLAYER_SEARCH_MIN_CHARS = 2;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

interface PlayerSearchResult {
  id: string;
  name: string;
  shuttleIqId: string | null;
  level: string;
  skillScore: number;
}

const initialOf = (name: string): string => (name ?? '').trim().charAt(0).toUpperCase();

const fieldStyle: CSSProperties = {
  position: 'relative', background: '#fff', borderRadius: 12, border: `1px solid ${MKT.navy}1F`,
  display: 'flex', alignItems: 'center', minHeight: 44,
};
const listStyle: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
  background: '#fff', border: `1px solid ${MKT.navy}1F`, borderRadius: 12, overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
};
const noteStyle: CSSProperties = { margin: 0, padding: '12px 14px', fontFamily: FF_BODY, fontSize: 13, color: MKT.inkSub };

export function PlayerSearch({ placeholder = 'Search players', style }: { placeholder?: string; style?: CSSProperties }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const q = useDebouncedValue(query.trim(), PLAYER_SEARCH_DEBOUNCE_MS);
  const enabled = q.length >= PLAYER_SEARCH_MIN_CHARS;

  const { data, isLoading, isError, error } = useQuery<PlayerSearchResult[]>({
    queryKey: ['/api/marketplace/search-players', q],
    queryFn: () => apiRequest('GET', `/api/marketplace/search-players?q=${encodeURIComponent(q)}`),
    enabled,
    retry: false,
    staleTime: 30_000,
  });

  // A tap outside the field + list closes the list; the typed text stays.
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, []);

  const showList = open && enabled;
  const status = (error as { status?: number } | null)?.status;
  const signIn = `/marketplace/login?from=${encodeURIComponent(location)}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }} data-testid="player-search">
      <div style={fieldStyle}>
        <Search aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: MKT.inkSub }} />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls="player-search-listbox"
          aria-autocomplete="list"
          autoComplete="off"
          data-testid="input-player-search-players"
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: FF_BODY, fontSize: 15, color: MKT.ink, padding: '10px 14px 10px 40px' }}
        />
      </div>

      {showList && (
        <div id="player-search-listbox" role="listbox" style={listStyle} data-testid="player-search-results" onClick={() => setOpen(false)}>
          {isLoading && <p style={noteStyle} data-testid="player-search-loading">Searching…</p>}
          {isError && status === 401 && (
            <Link href={signIn} data-testid="player-search-signin" style={{ ...noteStyle, display: 'block', color: MKT.navy, fontWeight: 600, textDecoration: 'none' }}>
              Sign in to search players
            </Link>
          )}
          {isError && status !== 401 && <p style={noteStyle} data-testid="player-search-error">Search failed. Try again.</p>}
          {data && data.length === 0 && <p style={noteStyle} data-testid="player-search-empty">No players found.</p>}
          {data && data.map((p) => (
            <PlayerLink
              key={p.id}
              playerId={p.id}
              name={p.name}
              testId="player-search-result"
              className="siq-press"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', minHeight: 44, borderTop: `1px solid ${MKT.navy}12` }}
            >
              <span
                data-testid="player-search-avatar"
                style={{ width: 32, height: 32, borderRadius: '50%', background: MKT.tealMist, color: MKT.tealText, fontFamily: FF_BODY, fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                {initialOf(p.name)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: FF_BODY, fontWeight: 600, fontSize: 14, color: MKT.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ display: 'block', fontFamily: FF_BODY, fontSize: 12, color: MKT.inkSub }}>
                  {getTierDisplayName(p.level)}{p.shuttleIqId ? ` · ${p.shuttleIqId}` : ''}
                </span>
              </span>
            </PlayerLink>
          ))}
        </div>
      )}
    </div>
  );
}
