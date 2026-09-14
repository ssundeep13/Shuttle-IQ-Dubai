// Admin — IQ Pass packs (Gate 7). Every pack with its buyer, status, seats,
// re-pick credits and the Club Elite jersey: size at checkout, "handed over"
// stamped here. Admin app (internal), same token pattern as the other admin
// screens. Reads only the admin routes, which 404 while the flag is off.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiUrl } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

type AdminPack = {
  id: string;
  tier: string;
  label: string;
  status: string;
  gamesTotal: number;
  priceAed: number;
  repickCredits: number;
  jerseySize: string | null;
  jerseyHandedOverAt: string | null;
  paidAt: string | null;
  createdAt: string;
  windowStart: string;
  windowEnd: string;
  userName: string;
  userEmail: string;
  seatsConfirmed: number;
};

const adminHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` });
const dubai = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function IqPassAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<AdminPack[]>({
    queryKey: ['/api/admin/iq-pass/packs'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/admin/iq-pass/packs'), { headers: adminHeaders() });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Failed to load packs');
      return res.json();
    },
    staleTime: 0,
  });

  const handedOver = useMutation({
    mutationFn: async (packId: string) => {
      const res = await fetch(apiUrl(`/api/admin/iq-pass/packs/${packId}/jersey-handed-over`), { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() } });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Jersey marked as handed over' }); queryClient.invalidateQueries({ queryKey: ['/api/admin/iq-pass/packs'] }); },
    onError: () => toast({ title: 'Could not update the jersey', variant: 'destructive' }),
  });

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold" data-testid="text-iq-pass-admin-title">IQ Pass packs</h1>
        <Link href="/admin/sessions"><Button variant="outline" size="sm">Sessions</Button></Link>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load packs.</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground" data-testid="text-iq-pass-admin-empty">No packs yet (or the IQ Pass flag is off).</p>}
      {data && data.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{data.length} pack{data.length === 1 ? '' : 's'}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="p-3">Player</th>
                  <th className="p-3">Pass</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Seats</th>
                  <th className="p-3">Window</th>
                  <th className="p-3">Paid</th>
                  <th className="p-3">Re-picks</th>
                  <th className="p-3">Jersey</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 align-top" data-testid={`row-pack-${p.id}`}>
                    <td className="p-3"><div className="font-medium">{p.userName}</div><div className="text-xs text-muted-foreground">{p.userEmail}</div></td>
                    <td className="p-3"><div>{p.label}</div><div className="text-xs text-muted-foreground">AED {p.priceAed}</div></td>
                    <td className="p-3"><Badge variant={p.status === 'active' ? 'default' : 'outline'}>{p.status}</Badge></td>
                    <td className="p-3">{p.seatsConfirmed} / {p.gamesTotal}</td>
                    <td className="p-3 whitespace-nowrap">{p.windowStart} → {p.windowEnd}</td>
                    <td className="p-3 whitespace-nowrap">{dubai(p.paidAt)}</td>
                    <td className="p-3">{p.repickCredits}</td>
                    <td className="p-3">
                      {p.jerseySize ? (
                        p.jerseyHandedOverAt ? (
                          <span className="text-xs">{p.jerseySize} · handed over {dubai(p.jerseyHandedOverAt)}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{p.jerseySize}</span>
                            <Button size="sm" variant="outline" onClick={() => handedOver.mutate(p.id)} disabled={handedOver.isPending} data-testid={`button-jersey-${p.id}`}>
                              Mark handed over
                            </Button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
