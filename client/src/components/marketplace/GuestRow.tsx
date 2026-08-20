// GuestRow — guest-search autocomplete (with free-text "add manually" fallback)
// for adding a guest to a booking. Extracted verbatim from SessionDetails.tsx
// (multi-tenancy Gate 2 — pure move) so it can be reused by SessionDetails and
// the My Bookings "Add a Guest" modal. No logic/props/timing/string changes.
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiUrl, getMarketplaceAccessToken } from '@/lib/queryClient';
import { getTierDisplayName } from '@shared/utils/skillUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { UserCheck, User, X, Search, Loader2 } from 'lucide-react';
import { MKT } from '@/pages/marketplace/LandingComponents';
import { LEVEL_COLORS, getInitials } from '@/lib/playerDisplay';

export interface GuestSearchResult {
  type: 'marketplace' | 'siq';
  name: string;
  email?: string;
  level?: string | null;
  marketplaceUserId?: string;
  siqPlayerId?: string;
}

export interface Guest {
  name: string;
  email: string;
  marketplaceUserId?: string;
  siqPlayerId?: string;
  linkedFromSearch: boolean;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GuestRow({
  idx,
  guest,
  onChange,
  onRemove,
}: {
  idx: number;
  guest: Guest;
  onChange: (g: Guest) => void;
  onRemove: () => void;
}) {
  const [searchInput, setSearchInput] = useState(guest.linkedFromSearch ? guest.name : '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [forceManual, setForceManual] = useState(!guest.linkedFromSearch && guest.name !== '');
  const debouncedQuery = useDebounce(searchInput, 280);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery<GuestSearchResult[]>({
    queryKey: ['/api/marketplace/search-guests', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      const token = getMarketplaceAccessToken();
      const res = await fetch(apiUrl(`/api/marketplace/search-guests?q=${encodeURIComponent(debouncedQuery)}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 && !guest.linkedFromSearch && !forceManual,
    staleTime: 30_000,
  });

  const showDropdown = dropdownOpen && !guest.linkedFromSearch && !forceManual && debouncedQuery.length >= 2;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectResult = (r: GuestSearchResult) => {
    onChange({
      name: r.name,
      email: r.email ?? '',
      marketplaceUserId: r.marketplaceUserId,
      siqPlayerId: r.siqPlayerId,
      linkedFromSearch: true,
    });
    setSearchInput(r.name);
    setDropdownOpen(false);
  };

  const clearSelection = () => {
    const name = guest.name;
    onChange({ name, email: '', linkedFromSearch: false });
    setSearchInput('');
    setForceManual(true);
    setDropdownOpen(false);
  };

  const needsEmail = !(guest.linkedFromSearch && !!guest.marketplaceUserId);

  return (
    <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: MKT.cream, border: `1px solid ${MKT.navy}12` }} ref={containerRef}>
      <div className="flex-1 space-y-2">
        {guest.linkedFromSearch ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background">
            {guest.marketplaceUserId ? (
              <UserCheck className="h-4 w-4 text-secondary shrink-0" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className="flex-1 text-sm font-medium truncate">{guest.name}</span>
            {guest.marketplaceUserId ? (
              <Badge variant="secondary" className="text-[10px] shrink-0">Marketplace</Badge>
            ) : guest.siqPlayerId ? (
              <Badge variant="outline" className="text-[10px] shrink-0">SIQ Player</Badge>
            ) : null}
            <button
              type="button"
              onClick={clearSelection}
              className="siq-press shrink-0 p-3 -m-3 text-muted-foreground hover:text-foreground"
              data-testid={`button-clear-guest-${idx}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : forceManual ? (
          <Input
            placeholder={`Guest ${idx + 1} name *`}
            value={guest.name}
            onChange={e => onChange({ ...guest, name: e.target.value })}
            data-testid={`input-guest-name-${idx}`}
          />
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              {isFetching && debouncedQuery.length >= 2 && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground pointer-events-none" />
              )}
              <Input
                className="pl-8"
                placeholder={`Search guest ${idx + 1} by name…`}
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                data-testid={`input-guest-search-${idx}`}
              />
            </div>

            {showDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
                {results.length === 0 && !isFetching ? (
                  <div className="p-3 space-y-1">
                    <p className="text-xs text-muted-foreground text-center py-1">No matches found.</p>
                    <button
                      type="button"
                      className="siq-press w-full text-left text-xs text-primary hover:underline active:underline min-h-11 px-1"
                      onClick={() => { setForceManual(true); onChange({ ...guest, name: searchInput }); setDropdownOpen(false); }}
                      data-testid={`button-add-manually-${idx}`}
                    >
                      Add "{searchInput}" manually instead
                    </button>
                  </div>
                ) : (
                  <>
                    {results.map((r, ri) => {
                      const levelKey = r.level?.toLowerCase() ?? '';
                      const levelColor = LEVEL_COLORS[levelKey] ?? '';
                      return (
                        <button
                          key={ri}
                          type="button"
                          className="siq-press w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent active:bg-accent text-left transition-colors"
                          onClick={() => selectResult(r)}
                          data-testid={`option-guest-${idx}-${ri}`}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-[10px] font-semibold bg-secondary/20 text-secondary">
                              {getInitials(r.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{r.name}</p>
                            {r.email && (
                              <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {r.level && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${levelColor}`}>
                                {getTierDisplayName(r.level)}
                              </span>
                            )}
                            {r.type === 'marketplace' ? (
                              <Badge variant="secondary" className="text-[10px]">Marketplace</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">SIQ Player</Badge>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    <div className="border-t px-3 py-2">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => { setForceManual(true); onChange({ ...guest, name: searchInput }); setDropdownOpen(false); }}
                        data-testid={`button-add-manually-${idx}`}
                      >
                        Not in the list? Add manually
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {guest.linkedFromSearch && guest.marketplaceUserId && guest.email ? (
          <div className="relative">
            <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary pointer-events-none" />
            <Input
              className="pl-8 bg-muted/50 text-muted-foreground cursor-default"
              value={guest.email}
              readOnly
              tabIndex={-1}
              data-testid={`input-guest-email-${idx}`}
            />
          </div>
        ) : needsEmail ? (
          <Input
            placeholder="Email (optional — for cancellation link)"
            type="email"
            value={guest.email}
            onChange={e => onChange({ ...guest, email: e.target.value })}
            data-testid={`input-guest-email-${idx}`}
          />
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        data-testid={`button-remove-guest-${idx}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
