import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Users, Plus, Trash2, CheckCircle, MapPin, Clock, Pencil, Link2, Search, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';

function SessionForm({ initial, onSubmit, isPending, submitLabel }: {
  initial: { title: string; description: string; venueName: string; venueLocation: string; date: string; startTime: string; endTime: string; courtCount: string; capacity: string; priceAed: string; };
  onSubmit: (form: typeof initial) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="space-y-3 mt-2">
      <div className="space-y-1">
        <Label>Title</Label>
        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="input-session-title" />
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="input-session-description" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Venue Name</Label>
          <Input value={form.venueName} onChange={e => setForm({ ...form, venueName: e.target.value })} data-testid="input-venue-name" />
        </div>
        <div className="space-y-1">
          <Label>Location</Label>
          <Input value={form.venueLocation} onChange={e => setForm({ ...form, venueLocation: e.target.value })} data-testid="input-venue-location" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} data-testid="input-session-date" />
        </div>
        <div className="space-y-1">
          <Label>Start Time</Label>
          <Input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} data-testid="input-start-time" />
        </div>
        <div className="space-y-1">
          <Label>End Time</Label>
          <Input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} data-testid="input-end-time" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Courts</Label>
          <Input type="number" value={form.courtCount} onChange={e => setForm({ ...form, courtCount: e.target.value })} data-testid="input-court-count" />
        </div>
        <div className="space-y-1">
          <Label>Capacity</Label>
          <Input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} data-testid="input-capacity" />
        </div>
        <div className="space-y-1">
          <Label>Price (AED)</Label>
          <Input type="number" value={form.priceAed} onChange={e => setForm({ ...form, priceAed: e.target.value })} data-testid="input-price" />
        </div>
      </div>
      <Button
        className="w-full"
        onClick={() => onSubmit(form)}
        disabled={isPending || !form.title || !form.venueName || !form.date || !form.startTime || !form.endTime}
        data-testid="button-submit-session-form"
      >
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </div>
  );
}

function SessionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editSession, setEditSession] = useState<BookableSessionWithAvailability | null>(null);

  const { data: sessions, isLoading } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const createMutation = useMutation({
    mutationFn: async (form: any) => {
      const res = await fetch('/api/marketplace/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          courtCount: parseInt(form.courtCount),
          capacity: parseInt(form.capacity),
          priceAed: parseInt(form.priceAed),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw { error: data.error || 'Failed to create' };
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Session created' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      setCreateOpen(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed', description: error.error, variant: 'destructive' });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: any }) => {
      const res = await fetch(`/api/marketplace/sessions/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          venueName: form.venueName,
          venueLocation: form.venueLocation,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          courtCount: parseInt(form.courtCount),
          capacity: parseInt(form.capacity),
          priceAed: parseInt(form.priceAed),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw { error: data.error || 'Failed to update' };
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Session updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      setEditSession(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed', description: error.error, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketplace/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Session deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
    },
  });

  const totalRevenue = sessions?.reduce((sum, s) => sum + (s.totalBookings * s.priceAed), 0) || 0;
  const totalBookings = sessions?.reduce((sum, s) => sum + s.totalBookings, 0) || 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-sessions">{sessions?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Total Sessions</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-bookings">{totalBookings}</div>
              <div className="text-xs text-muted-foreground">Total Bookings</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <div className="text-2xl font-bold" data-testid="text-total-revenue">AED {totalRevenue}</div>
              <div className="text-xs text-muted-foreground">Revenue</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Bookable Sessions</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-create-session">
              <Plus className="h-4 w-4" /> Create Session
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Bookable Session</DialogTitle>
            </DialogHeader>
            <SessionForm
              initial={{ title: '', description: '', venueName: '', venueLocation: '', date: '', startTime: '', endTime: '', courtCount: '4', capacity: '16', priceAed: '50' }}
              onSubmit={(form) => createMutation.mutate(form)}
              isPending={createMutation.isPending}
              submitLabel="Create Session"
            />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editSession} onOpenChange={(open) => !open && setEditSession(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
          </DialogHeader>
          {editSession && (
            <SessionForm
              initial={{
                title: editSession.title,
                description: editSession.description || '',
                venueName: editSession.venueName,
                venueLocation: editSession.venueLocation || '',
                date: format(new Date(editSession.date), 'yyyy-MM-dd'),
                startTime: editSession.startTime,
                endTime: editSession.endTime,
                courtCount: String(editSession.courtCount),
                capacity: String(editSession.capacity),
                priceAed: String(editSession.priceAed),
              }}
              onSubmit={(form) => editMutation.mutate({ id: editSession.id, form })}
              isPending={editMutation.isPending}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="space-y-3">
          {sessions?.map((session) => (
            <Card key={session.id} data-testid={`card-admin-session-${session.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{session.title}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {format(new Date(session.date), 'MMM d, yyyy')}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {session.startTime}-{session.endTime}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {session.venueName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">{session.totalBookings}/{session.capacity} booked</Badge>
                    <Badge variant="secondary">AED {session.priceAed}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditSession(session)}
                      data-testid={`button-edit-session-${session.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(session.id)}
                      data-testid={`button-delete-session-${session.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: sessions } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const { data: bookings, isLoading: bookingsLoading } = useQuery<BookingWithDetails[]>({
    queryKey: ['/api/marketplace/sessions', selectedSession, 'bookings'],
    enabled: !!selectedSession,
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/sessions/${selectedSession}/bookings`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const attendMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/marketplace/bookings/${bookingId}/attend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Attendance marked' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions', selectedSession, 'bookings'] });
    },
  });

  const selectedSessionData = sessions?.find(s => s.id === selectedSession);
  const sessionRevenue = bookings?.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + b.amountAed, 0) || 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Bookings by Session</h2>
      <div className="flex flex-wrap gap-2">
        {sessions?.map((s) => (
          <Button
            key={s.id}
            variant={selectedSession === s.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedSession(s.id)}
            data-testid={`button-select-session-${s.id}`}
          >
            {s.title} ({s.totalBookings})
          </Button>
        ))}
      </div>

      {selectedSession && selectedSessionData && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-muted-foreground">
                {selectedSessionData.title} - {format(new Date(selectedSessionData.date), 'MMM d, yyyy')}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm" data-testid="text-session-revenue">Revenue: AED {sessionRevenue}</span>
                <Badge variant="outline">{bookings?.filter(b => b.status === 'attended').length || 0} attended</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedSession && (
        bookingsLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : !bookings?.length ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">No bookings for this session</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {bookings.map((booking) => (
              <Card key={booking.id} data-testid={`card-admin-booking-${booking.id}`}>
                <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{booking.user?.name || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">{booking.user?.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={booking.status === 'confirmed' ? 'default' : booking.status === 'attended' ? 'secondary' : booking.status === 'pending' ? 'outline' : 'destructive'}>
                      {booking.status}
                    </Badge>
                    <span className="text-sm font-medium">AED {booking.amountAed}</span>
                    {booking.status === 'confirmed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => attendMutation.mutate(booking.id)}
                        disabled={attendMutation.isPending}
                        data-testid={`button-attend-${booking.id}`}
                      >
                        <CheckCircle className="h-3 w-3" /> Check In
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkingUser, setLinkingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ['/api/marketplace/admin/users'],
    queryFn: async () => {
      const res = await fetch('/api/marketplace/admin/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const searchPlayers = async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`/api/marketplace/admin/search-players?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      const results = await res.json();
      setSearchResults(results);
    }
  };

  const linkMutation = useMutation({
    mutationFn: async ({ marketplaceUserId, playerId }: { marketplaceUserId: string; playerId: number }) => {
      const res = await fetch('/api/marketplace/admin/link-player', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ marketplaceUserId, playerId }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Player linked' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/admin/users'] });
      setLinkingUser(null);
      setSearchQuery('');
      setSearchResults([]);
    },
    onError: () => {
      toast({ title: 'Failed to link player', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Marketplace Users</h2>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="space-y-2">
          {users?.map((user) => (
            <Card key={user.id} data-testid={`card-admin-user-${user.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}{user.phone ? ` | ${user.phone}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.linkedPlayer ? (
                      <Badge variant="secondary" className="text-xs">
                        Linked: {user.linkedPlayer.name} ({user.linkedPlayer.shuttleIqId})
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-xs">Not Linked</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setLinkingUser(user.id); setSearchQuery(''); setSearchResults([]); }}
                          data-testid={`button-link-player-${user.id}`}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {linkingUser === user.id && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Search by name, ID, or email..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); searchPlayers(e.target.value); }}
                        data-testid="input-search-player-link"
                      />
                      <Button variant="ghost" size="sm" onClick={() => setLinkingUser(null)}>Cancel</Button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="space-y-1">
                        {searchResults.map((player) => (
                          <div key={player.id} className="flex items-center justify-between p-2 rounded-md hover-elevate">
                            <div>
                              <span className="font-medium text-sm">{player.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{player.shuttleIqId} - {player.level}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => linkMutation.mutate({ marketplaceUserId: user.id, playerId: player.id })}
                              disabled={linkMutation.isPending}
                              data-testid={`button-confirm-link-${player.id}`}
                            >
                              Link
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminMarketplace() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">Marketplace Admin</h1>
      <Tabs defaultValue="sessions">
        <TabsList data-testid="tabs-admin-marketplace">
          <TabsTrigger value="sessions" data-testid="tab-sessions">Sessions</TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Players</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="bookings" className="mt-4">
          <BookingsTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
