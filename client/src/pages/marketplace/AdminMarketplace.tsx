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
import { Calendar, Users, Plus, Trash2, CheckCircle, MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { BookableSessionWithAvailability, BookingWithDetails } from '@shared/schema';

function SessionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', venueName: '', venueLocation: '',
    date: '', startTime: '', endTime: '', courtCount: '4', capacity: '16', priceAed: '50',
  });

  const { data: sessions, isLoading } = useQuery<BookableSessionWithAvailability[]>({
    queryKey: ['/api/marketplace/sessions'],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
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
      setForm({ title: '', description: '', venueName: '', venueLocation: '', date: '', startTime: '', endTime: '', courtCount: '4', capacity: '16', priceAed: '50' });
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

  return (
    <div className="space-y-4">
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
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.title || !form.venueName || !form.date || !form.startTime || !form.endTime}
                data-testid="button-submit-create-session"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Session'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                    <Badge variant={booking.status === 'confirmed' ? 'default' : booking.status === 'attended' ? 'secondary' : 'destructive'}>
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Marketplace Users</h2>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="space-y-2">
          {users?.map((user) => (
            <Card key={user.id} data-testid={`card-admin-user-${user.id}`}>
              <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
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
                    <Badge variant="outline" className="text-xs">Not Linked</Badge>
                  )}
                </div>
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
