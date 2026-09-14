// IQ Pass — move one game to another session (one step, up to 5 hours before
// the session being vacated). Lists the same rolling 4-week calendar the
// purchase flow shows, minus the current session, full sessions and sessions
// the player already holds. Colours from the IQ Pass token module only.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiUrl, getMarketplaceAccessToken } from '@/lib/queryClient';
import { IQP, IQP_FONT } from '@/lib/iqPassTokens';

export type IqPassCalendarSession = {
  id: string;
  title: string;
  venueName: string;
  dateDubai: string;
  startTime: string;
  endTime: string;
  spotsRemaining: number;
  packSeatsLeft: number;
  alreadyBooked: boolean;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 16 Sep" from a 'YYYY-MM-DD' Dubai day (no timezone maths). */
export function dubaiDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

const authHeaders = (): Record<string, string> => {
  const t = getMarketplaceAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export function useIqPassCalendar(enabled = true) {
  return useQuery<{ window: { start: string; end: string }; sessions: IqPassCalendarSession[] }>({
    queryKey: ['/api/marketplace/iq-pass/calendar'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/marketplace/iq-pass/calendar'), { headers: authHeaders() });
      if (!res.ok) throw new Error('calendar');
      return res.json();
    },
    enabled,
    staleTime: 15_000,
  });
}

export const MOVE_ERROR_COPY: Record<string, string> = {
  move_cutoff_passed: 'This game starts in under five hours, so it can no longer be moved.',
  move_with_guests: 'Cancel the guest on this game first, then move it.',
  session_full: 'That session is now full. Pick another one.',
  already_booked: 'You already have a booking on that session.',
  out_of_window: 'Pick a session within the next four weeks.',
  session_unavailable: 'That session is not available. Pick another one.',
  pack_not_active: 'This pass is no longer active.',
};

export function IqPassMoveDialog({ open, onOpenChange, bookingId, currentSessionId, onMoved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentSessionId: string;
  onMoved: (newBookingId: string) => void;
}) {
  const { data, isLoading } = useIqPassCalendar(open);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = (data?.sessions ?? []).filter((s) => s.id !== currentSessionId && !s.alreadyBooked && s.spotsRemaining > 0);

  const submit = async () => {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(apiUrl(`/api/marketplace/iq-pass/bookings/${bookingId}/move`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ toSessionId: target }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(MOVE_ERROR_COPY[j?.error] ?? 'Could not move this game. Please try again.'); return; }
      onMoved(j.newBookingId);
    } catch {
      setError('Could not move this game. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setTarget(null); setError(null); } onOpenChange(o); }}>
      <DialogContent data-testid="dialog-iq-pass-move" style={{ fontFamily: IQP_FONT, color: IQP.ink }}>
        <DialogHeader>
          <DialogTitle style={{ color: IQP.navy }}>Move this game</DialogTitle>
          <DialogDescription style={{ color: IQP.inkSub }}>Pick the session you want instead. Moves are allowed until five hours before the game you are leaving.</DialogDescription>
        </DialogHeader>
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 6 }}>
          {isLoading && <p style={{ color: IQP.inkSub, fontSize: 14 }}>Loading sessions…</p>}
          {!isLoading && rows.length === 0 && <p style={{ color: IQP.inkSub, fontSize: 14 }}>No other sessions are open in the next four weeks.</p>}
          {rows.map((s) => {
            const active = target === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setTarget(s.id)}
                aria-pressed={active}
                data-testid={`move-row-${s.id}`}
                style={{
                  textAlign: 'left', minHeight: 44, padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                  background: active ? IQP.navy : IQP.white, color: active ? IQP.white : IQP.ink,
                  border: `1px solid ${active ? IQP.navy : IQP.line}`, fontFamily: IQP_FONT,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{dubaiDayLabel(s.dateDubai)} · {s.startTime}–{s.endTime}</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{s.venueName}</div>
              </button>
            );
          })}
        </div>
        {error && <p data-testid="text-move-error" style={{ color: IQP.navy, fontSize: 13, margin: 0 }}>{error}</p>}
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} disabled={busy} data-testid="button-move-cancel"
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 6, border: `1px solid ${IQP.line}`, background: IQP.white, color: IQP.navy, fontFamily: IQP_FONT, fontWeight: 600, cursor: 'pointer' }}>
            Keep it
          </button>
          <button type="button" onClick={submit} disabled={!target || busy} data-testid="button-move-confirm"
            style={{ minHeight: 44, padding: '0 16px', borderRadius: 6, border: 'none', background: IQP.teal, color: IQP.white, fontFamily: IQP_FONT, fontWeight: 700, cursor: 'pointer', opacity: !target || busy ? 0.6 : 1 }}>
            {busy ? 'Moving…' : 'Move game'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
