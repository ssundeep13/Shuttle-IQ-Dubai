import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Building2, MapPin, LayoutGrid, ShoppingBag, Clock, DollarSign, Users, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { sessionDurationHours } from "@shared/sessionTime";
import type { Session, BookableSessionWithAvailability, Venue, SessionRunner } from "@shared/schema";

interface EditSessionModalProps {
  open: boolean;
  onClose: () => void;
  session: Session | null;
  linkedBookable: BookableSessionWithAvailability | null;
}

const editSessionSchema = z.object({
  venueName: z.string().min(1, "Venue name is required"),
  venueLocation: z.string().optional(),
  venueMapUrl: z.string().optional().refine(
    val => !val || /^https?:\/\/.+/.test(val),
    { message: "Must be a valid URL (starting with http)" }
  ),
  date: z.string().min(1, "Date is required"),
  courtCount: z.number().min(1).max(8),
  marketplaceTitle: z.string().optional(),
  marketplaceDescription: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().min(1).optional(),
  priceAed: z.number().min(0).optional(),
});

type EditSessionFormValues = z.infer<typeof editSessionSchema>;

export function EditSessionModal({ open, onClose, session, linkedBookable }: EditSessionModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<EditSessionFormValues>({
    resolver: zodResolver(editSessionSchema),
    defaultValues: {
      venueName: "",
      venueLocation: "",
      venueMapUrl: "",
      date: "",
      courtCount: 2,
      marketplaceTitle: "",
      marketplaceDescription: "",
      startTime: "",
      endTime: "",
      capacity: 16,
      priceAed: 50,
    },
  });

  const { data: venues = [] } = useQuery<Venue[]>({ queryKey: ['/api/venues'], queryFn: () => apiRequest<Venue[]>('GET', '/api/venues') });
  const { data: runners = [] } = useQuery<SessionRunner[]>({ queryKey: ['/api/session-runners'], queryFn: () => apiRequest<SessionRunner[]>('GET', '/api/session-runners') });
  const activeVenues = venues.filter(v => v.isActive);
  const activeRunners = runners.filter(r => r.isActive);

  const { data: costs } = useQuery<{ courtCostFils: number; shuttleCostFils: number; waterCostFils: number; captainId: string | null; courtCostOverridden: boolean } | null>({
    queryKey: ['/api/sessions', linkedBookable?.id, 'costs'],
    queryFn: () => apiRequest('GET', `/api/sessions/${linkedBookable!.id}/costs`),
    enabled: open && !!linkedBookable,
  });

  const [captainId, setCaptainId] = useState<string | null>(null);
  const [shuttleCostAed, setShuttleCostAed] = useState(0);
  const [waterCostAed, setWaterCostAed] = useState(0);
  const [courtCostAed, setCourtCostAed] = useState<number | null>(null); // prefilled; null = no row yet
  const [courtCostDirty, setCourtCostDirty] = useState(false); // only send courtCostAed if the admin edits it

  // Prefill cost state from GET /api/sessions/:id/costs (null on a legacy session with no row).
  useEffect(() => {
    if (!open) return;
    setCourtCostDirty(false);
    if (costs) {
      setCaptainId(costs.captainId ?? null);
      setShuttleCostAed(costs.shuttleCostFils / 100);
      setWaterCostAed(costs.waterCostFils / 100);
      setCourtCostAed(costs.courtCostFils / 100);
    } else {
      setCaptainId(null); setShuttleCostAed(0); setWaterCostAed(0); setCourtCostAed(null);
    }
  }, [costs, open]);

  // Court-cost auto preview (client mirror of the server auto-fill), reactive to the form.
  const wVenue = form.watch('venueName');
  const wCourts = form.watch('courtCount');
  const wStart = form.watch('startTime');
  const wEnd = form.watch('endTime');
  const selVenue = activeVenues.find(v => v.name === wVenue);
  const durH = sessionDurationHours(wStart || '', wEnd || '');
  const autoCourtAed = (selVenue && selVenue.courtRateFilsPerHour > 0 && Number.isFinite(durH))
    ? (selVenue.courtRateFilsPerHour / 100) * (wCourts || 0) * durH
    : 0;
  const courtCostShown = courtCostAed != null ? courtCostAed : autoCourtAed;

  useEffect(() => {
    if (session && open) {
      const dateStr = new Date(session.date).toISOString().split('T')[0];
      form.reset({
        venueName: session.venueName,
        venueLocation: session.venueLocation || "",
        venueMapUrl: session.venueMapUrl || "",
        date: dateStr,
        courtCount: session.courtCount,
        marketplaceTitle: linkedBookable?.title || "",
        marketplaceDescription: linkedBookable?.description || "",
        startTime: linkedBookable?.startTime || "18:00",
        endTime: linkedBookable?.endTime || "21:00",
        capacity: linkedBookable?.capacity || 16,
        priceAed: linkedBookable?.priceAed || 50,
      });
    }
  }, [session, linkedBookable, open, form]);

  const updateSessionMutation = useMutation({
    mutationFn: async (values: EditSessionFormValues) => {
      const adminUpdates = {
        venueName: values.venueName,
        venueLocation: values.venueLocation || null,
        venueMapUrl: values.venueMapUrl || null,
        date: values.date,
        courtCount: values.courtCount,
      };

      await apiRequest('PATCH', `/api/sessions/${session!.id}`, adminUpdates);

      if (linkedBookable) {
        const marketplaceUpdates = {
          title: values.marketplaceTitle,
          description: values.marketplaceDescription || null,
          venueName: values.venueName,
          venueLocation: values.venueLocation || null,
          venueMapUrl: values.venueMapUrl || null,
          date: values.date,
          startTime: values.startTime,
          endTime: values.endTime,
          courtCount: values.courtCount,
          capacity: values.capacity,
          priceAed: values.priceAed,
          captainId,
          shuttleCostAed,
          waterCostAed,
          ...(courtCostDirty ? { courtCostAed } : {}),
        };

        await apiRequest('PATCH', `/api/marketplace/sessions/${linkedBookable.id}`, marketplaceUpdates);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/sessions'] });
      toast({
        title: "Session Updated",
        description: linkedBookable 
          ? "Session and marketplace listing updated successfully" 
          : "Session updated successfully",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update session",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: EditSessionFormValues) => {
    updateSessionMutation.mutate(values);
  };

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="modal-edit-session">
        <DialogHeader>
          <DialogTitle>Edit Session</DialogTitle>
          <DialogDescription>
            Update session details{linkedBookable ? " and marketplace listing" : ""}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="venueName"
              render={({ field }) => {
                const known = activeVenues.some(v => v.name === field.value);
                return (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Venue
                    </FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={(name) => {
                        field.onChange(name);
                        const picked = activeVenues.find((x) => x.name === name);
                        if (picked?.location) form.setValue('venueLocation', picked.location);
                        if (picked?.mapUrl) form.setValue('venueMapUrl', picked.mapUrl);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="min-h-12 sm:min-h-10" data-testid="select-edit-venue-name">
                          <SelectValue placeholder="Select a venue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!known && field.value ? (
                          <SelectItem value={field.value}>{field.value} (not in venue list)</SelectItem>
                        ) : null}
                        {activeVenues.map((v) => (
                          <SelectItem key={v.id} value={v.name}>
                            {v.name}{v.courtRateFilsPerHour > 0 ? ` — AED ${v.courtRateFilsPerHour / 100}/court/hr` : ' (price not set)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!known && field.value ? (
                      <p className="text-xs text-amber-600">Legacy venue name — not linked to a priced venue; court cost won't auto-fill until you pick one.</p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="venueLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Venue Location
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., 123 Main St, City"
                      className="min-h-12 sm:min-h-10"
                      data-testid="input-edit-venue-location"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="venueMapUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Google Maps Link
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://maps.app.goo.gl/..."
                      className="min-h-12 sm:min-h-10"
                      data-testid="input-edit-venue-map-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Session Date
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      className="min-h-12 sm:min-h-10"
                      data-testid="input-edit-session-date"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="courtCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    Number of Courts
                  </FormLabel>
                  <Select
                    value={field.value?.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value, 10))}
                  >
                    <FormControl>
                      <SelectTrigger
                        className="min-h-12 sm:min-h-10"
                        data-testid="select-edit-court-count"
                      >
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count} {count === 1 ? 'Court' : 'Courts'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {linkedBookable && (
              <>
                <Separator />
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <ShoppingBag className="h-4 w-4" />
                    Marketplace Listing
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    These fields are shown to players on the marketplace.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="marketplaceTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Listing Title</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g., Evening Badminton Session"
                          className="min-h-12 sm:min-h-10"
                          data-testid="input-edit-marketplace-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="marketplaceDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe the session for players..."
                          className="min-h-[80px]"
                          data-testid="input-edit-marketplace-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Start Time
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            className="min-h-12 sm:min-h-10"
                            data-testid="input-edit-start-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          End Time
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            className="min-h-12 sm:min-h-10"
                            data-testid="input-edit-end-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Max Players
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                            className="min-h-12 sm:min-h-10"
                            data-testid="input-edit-capacity"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priceAed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Price (AED)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            className="min-h-12 sm:min-h-10"
                            data-testid="input-edit-price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* ── Session costs + captain (Phase 1 gate d) ── */}
                <Separator />
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <DollarSign className="h-4 w-4" />
                  Session costs &amp; captain
                </Label>

                <div className="space-y-2">
                  <Label>Captain / who ran it</Label>
                  <Select value={captainId ?? '__none__'} onValueChange={(v) => setCaptainId(v === '__none__' ? null : v)}>
                    <SelectTrigger className="min-h-12 sm:min-h-10" data-testid="select-edit-captain">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not set</SelectItem>
                      {activeRunners.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
                      {captainId && !activeRunners.some(r => r.id === captainId) && runners.find(r => r.id === captainId) ? (
                        <SelectItem value={captainId}>{runners.find(r => r.id === captainId)!.name} (inactive)</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Court cost (AED)
                    <span className="text-xs font-normal text-muted-foreground"> — auto from venue rate; edit to override</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={Number.isFinite(courtCostShown) ? Math.round(courtCostShown * 100) / 100 : 0}
                    onChange={(e) => { setCourtCostAed(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0)); setCourtCostDirty(true); }}
                    className="min-h-12 sm:min-h-10"
                    data-testid="input-edit-court-cost"
                  />
                  {!courtCostDirty && courtCostAed == null && (
                    <p className="text-xs text-muted-foreground">
                      {selVenue && selVenue.courtRateFilsPerHour > 0 && Number.isFinite(durH)
                        ? `Auto: AED ${Math.round(autoCourtAed * 100) / 100}`
                        : 'Auto: AED 0 — venue rate not set, or times invalid'}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shuttle cost (AED)</Label>
                    <Input type="number" min={0} value={shuttleCostAed} onChange={(e) => setShuttleCostAed(parseFloat(e.target.value) || 0)} className="min-h-12 sm:min-h-10" data-testid="input-edit-shuttle-cost" />
                  </div>
                  <div className="space-y-2">
                    <Label>Water cost (AED)</Label>
                    <Input type="number" min={0} value={waterCostAed} onChange={(e) => setWaterCostAed(parseFloat(e.target.value) || 0)} className="min-h-12 sm:min-h-10" data-testid="input-edit-water-cost" />
                  </div>
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="min-h-12 sm:min-h-10"
                data-testid="button-cancel-edit-session"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateSessionMutation.isPending}
                className="min-h-12 sm:min-h-10"
                data-testid="button-save-edit-session"
              >
                {updateSessionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
