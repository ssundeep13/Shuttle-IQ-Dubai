// Venue price-book admin tab (Phase 1 gate c). Super-admin only — mounted in
// SessionsManagement behind the same `user?.role === 'super_admin'` gate as Finance.
// Talks to the live /api/venues endpoints (gate c change 1).
//
// MONEY: the API stores court_rate_fils_per_hour in FILS. This screen enters/shows AED
// and bridges with aedToFils()/filsToAed(). A 0 rate renders as "Not set yet" — never
// "Free" or "AED 0". Rename is intentionally disabled this gate (sessions match venues
// by NAME until gate d links by id), so editing a name here could orphan the match.
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient as qc, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Plus, AlertCircle, Check, X, Pencil } from 'lucide-react';
import type { Venue } from '@shared/schema';

// AED <-> fils. Math.round on the way IN so fractional AED can never drift a fil.
const filsToAed = (fils: number): number => fils / 100;
const aedToFils = (aed: number): number => Math.round(aed * 100);

function errMsg(err: unknown): string {
  const e = err as { error?: string; message?: string } | null;
  return (e && (e.error || e.message)) || 'Something went wrong. Please try again.';
}

export default function VenueTab() {
  const { toast } = useToast();

  const { data: venues = [], isLoading, isError } = useQuery<Venue[]>({
    queryKey: ['/api/venues'],
    queryFn: () => apiRequest<Venue[]>('GET', '/api/venues'),
  });

  // Add-venue form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAed, setNewAed] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newMapUrl, setNewMapUrl] = useState('');

  // Inline edit (per row): price + location + map link
  const [editId, setEditId] = useState<string | null>(null);
  const [editAed, setEditAed] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editMapUrl, setEditMapUrl] = useState('');

  const createMutation = useMutation({
    mutationFn: (body: { name: string; courtRateFilsPerHour: number; location: string | null; mapUrl: string | null }) =>
      apiRequest('POST', '/api/venues', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/venues'] });
      setShowAdd(false); setNewName(''); setNewAed(''); setNewLocation(''); setNewMapUrl('');
      toast({ title: 'Venue added' });
    },
    onError: (err) => toast({ title: 'Could not add venue', description: errMsg(err), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<{ courtRateFilsPerHour: number; isActive: boolean; location: string | null; mapUrl: string | null }> }) =>
      apiRequest('PATCH', `/api/venues/${id}`, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/venues'] });
      toast({ title: 'Venue updated' });
    },
    onError: (err) => toast({ title: 'Could not update venue', description: errMsg(err), variant: 'destructive' }),
  });

  const startEdit = (v: Venue) => {
    setEditId(v.id);
    setEditAed(v.courtRateFilsPerHour ? String(filsToAed(v.courtRateFilsPerHour)) : '');
    setEditLocation(v.location ?? '');
    setEditMapUrl(v.mapUrl ?? '');
  };

  const saveDetails = (id: string) => {
    const aed = parseFloat(editAed);
    if (editAed.trim() === '' || isNaN(aed) || aed < 0) {
      toast({ title: 'Enter a valid price', description: 'Price must be 0 or more (AED).', variant: 'destructive' });
      return;
    }
    const mapUrl = editMapUrl.trim();
    if (mapUrl && !/^https?:\/\/.+/.test(mapUrl)) {
      toast({ title: 'Invalid Google Maps link', description: 'Must start with http:// or https://', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({ id, updates: { courtRateFilsPerHour: aedToFils(aed), location: editLocation.trim() || null, mapUrl: mapUrl || null } });
    setEditId(null);
  };

  const submitAdd = () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: 'Name required', description: 'Enter a venue name.', variant: 'destructive' });
      return;
    }
    const aed = newAed.trim() === '' ? 0 : parseFloat(newAed);
    if (isNaN(aed) || aed < 0) {
      toast({ title: 'Enter a valid price', description: 'Price must be 0 or more (AED).', variant: 'destructive' });
      return;
    }
    const mapUrl = newMapUrl.trim();
    if (mapUrl && !/^https?:\/\/.+/.test(mapUrl)) {
      toast({ title: 'Invalid Google Maps link', description: 'Must start with http:// or https://', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ name, courtRateFilsPerHour: aedToFils(aed), location: newLocation.trim() || null, mapUrl: mapUrl || null });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          <CardTitle>Venues — court price book</CardTitle>
        </div>
        {!showAdd && (
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-venue">
            <Plus className="w-4 h-4 mr-1" /> Add venue
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Price is <strong>AED per court, per hour</strong>. Renaming a venue is disabled here for now —
          sessions match venues by name until they're linked by id in a later step.
        </p>

        {/* Add-venue form */}
        {showAdd && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-venue-name">Venue name</Label>
                <Input
                  id="new-venue-name"
                  placeholder="e.g. Al Manara Sports Hall"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="input-venue-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-venue-price">AED per court, per hour</Label>
                <Input
                  id="new-venue-price"
                  type="number" min="0" step="1" inputMode="numeric"
                  placeholder="0 = not set yet"
                  value={newAed}
                  onChange={(e) => setNewAed(e.target.value)}
                  data-testid="input-venue-new-price"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-venue-location">Location <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="new-venue-location" placeholder="e.g. Al Nasr, Dubai" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} data-testid="input-venue-new-location" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-venue-mapurl">Google Maps link <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="new-venue-mapurl" placeholder="https://maps.app.goo.gl/..." value={newMapUrl} onChange={(e) => setNewMapUrl(e.target.value)} data-testid="input-venue-new-mapurl" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitAdd} disabled={createMutation.isPending} data-testid="button-venue-create">
                <Check className="w-4 h-4 mr-1" /> Save venue
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewName(''); setNewAed(''); setNewLocation(''); setNewMapUrl(''); }}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {/* States */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" /> Couldn't load venues. Refresh to try again.
          </div>
        ) : venues.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No venues yet. Add one to start the price book.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {venues.map((v) => {
              const isEditing = editId === v.id;
              const notSet = !v.courtRateFilsPerHour; // 0 or falsy
              return (
                <div key={v.id} className="p-3 space-y-2" data-testid={`row-venue-${v.id}`}>
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" title={v.name}>{v.name}</span>
                      {!isEditing && (v.location || v.mapUrl) ? (
                        <span className="text-xs text-muted-foreground truncate block">
                          {v.location || ''}{v.location && v.mapUrl ? ' · ' : ''}
                          {v.mapUrl ? (
                            <a href={v.mapUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground" data-testid={`link-venue-map-${v.id}`}>Map</a>
                          ) : null}
                        </span>
                      ) : null}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-2">
                        {notSet ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-300" data-testid={`badge-venue-unset-${v.id}`}>
                            Not set yet
                          </Badge>
                        ) : (
                          <span className="text-sm font-semibold tabular-nums" data-testid={`text-venue-price-${v.id}`}>
                            AED {filsToAed(v.courtRateFilsPerHour)}
                            <span className="text-xs font-normal text-muted-foreground"> / court / hour</span>
                          </span>
                        )}
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => startEdit(v)} data-testid={`button-venue-edit-${v.id}`}>
                          <Pencil className="w-3.5 h-3.5 mr-1" /> {notSet ? 'Set price' : 'Edit'}
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 shrink-0 pl-2">
                      <Switch
                        checked={v.isActive}
                        onCheckedChange={(val) => updateMutation.mutate({ id: v.id, updates: { isActive: val } })}
                        data-testid={`switch-venue-active-${v.id}`}
                      />
                      <span className="text-xs text-muted-foreground w-12">{v.isActive ? 'Active' : 'Hidden'}</span>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="pl-7 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-28 shrink-0">AED / court / hour</span>
                        <Input
                          type="number" min="0" step="1" inputMode="numeric"
                          className="h-8 w-28"
                          value={editAed}
                          onChange={(e) => setEditAed(e.target.value)}
                          autoFocus
                          data-testid={`input-venue-price-${v.id}`}
                        />
                      </div>
                      <Input className="h-8" placeholder="Location (optional)" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} data-testid={`input-venue-location-${v.id}`} />
                      <Input className="h-8" placeholder="Google Maps link (optional)" value={editMapUrl} onChange={(e) => setEditMapUrl(e.target.value)} data-testid={`input-venue-mapurl-${v.id}`} />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-8" onClick={() => saveDetails(v.id)} disabled={updateMutation.isPending} data-testid={`button-venue-save-${v.id}`}>
                          <Check className="w-4 h-4 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                          <X className="w-4 h-4 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
