import './_group.css';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  MapPin, Clock, Timer, ListOrdered, UserPlus, Users, ChevronDown, ChevronUp, Calendar
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function VariantB() {
  const [isPastOpen, setIsPastOpen] = useState(false);

  return (
    <div className="bookings-redesign-root min-h-screen bg-background">
      <div className="max-w-[440px] mx-auto bg-background min-h-[100dvh] relative pb-20 shadow-2xl shadow-black/5 ring-1 ring-border/50">
        <header className="px-5 pt-10 pb-4 flex items-center justify-between sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border/40">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">My Bookings</h1>
            <Badge variant="secondary" className="rounded-full px-2 h-5 text-[10px] font-bold bg-secondary/10 text-secondary border-0">4 active</Badge>
          </div>
        </header>

        <main className="p-5 flex flex-col gap-8">
          {/* Urgent Banners */}
          <div className="flex flex-col gap-2">
            {/* Pending Payment */}
            <div className="bg-orange-50 border border-orange-200/60 rounded-xl p-3 shadow-sm flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-orange-600 shrink-0" />
                <span className="text-sm font-bold text-orange-900 truncate">Wednesday Smash Night</span>
                <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full ml-auto shrink-0">2h 14m left</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-orange-700/80 font-medium">May 6 • 19:00 • AED 35</span>
                <div className="flex items-center gap-3 shrink-0">
                  <button className="text-xs text-orange-600 hover:text-orange-700 font-bold transition-colors">Decline Spot</button>
                  <button className="text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-md px-3 py-1.5 font-bold shadow-sm transition-transform active:scale-95">Pay Now</button>
                </div>
              </div>
            </div>

            {/* Waitlisted */}
            <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 shadow-sm flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-amber-600 shrink-0" />
                <span className="text-sm font-bold text-amber-900 truncate">Friday Doubles League</span>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full ml-auto shrink-0">Pos #3</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-700/80 font-medium">May 8 • 20:30</span>
                <div className="shrink-0">
                  <button className="text-xs text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md px-3 py-1.5 font-bold transition-colors">Leave Waitlist</button>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Card - Next Session */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Up Next</h2>
            <div className="bg-primary text-primary-foreground rounded-[1.5rem] p-6 shadow-xl shadow-primary/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 -ml-10 -mb-10 w-32 h-32 bg-secondary/20 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="relative z-10 flex flex-col gap-6">
                <div className="flex justify-between items-start">
                  <Badge className="bg-white/10 text-white hover:bg-white/10 border border-white/10 font-semibold px-3 py-1">Confirmed</Badge>
                  <div className="text-right">
                    <div className="text-3xl font-black tracking-tight">Sun, May 3</div>
                    <div className="text-primary-foreground/70 text-sm font-semibold tracking-wide mt-0.5">17:00 – 20:00</div>
                  </div>
                </div>

                <div className="pt-2 pb-1 border-y border-white/10 my-1">
                  <h3 className="text-xl font-bold leading-tight mb-2 tracking-tight">Sunday Open Play (3 hrs)</h3>
                  <div className="flex flex-col gap-2 text-primary-foreground/80 text-sm font-medium">
                    <div className="flex items-center gap-2.5">
                      <MapPin className="h-4 w-4 text-secondary shrink-0" />
                      <span className="truncate">Dubai Sports World</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Users className="h-4 w-4 text-secondary shrink-0" />
                      <span className="truncate">2 Spots (You + Aarav Mehta)</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] text-primary-foreground/60 uppercase font-bold tracking-widest">Payment</div>
                    <div className="text-sm font-bold">AED 90</div>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <div className="text-[10px] text-primary-foreground/60 uppercase font-bold tracking-widest">Method</div>
                    <div className="text-sm font-bold text-secondary">Pay at Venue</div>
                  </div>
                </div>

                <div className="flex gap-2 w-full pt-3">
                  <button className="flex-1 bg-white text-primary rounded-xl py-3.5 text-sm font-bold shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2">
                    <UserPlus className="h-4 w-4" /> Add Guest
                  </button>
                  <button className="bg-white/10 text-white border border-white/10 rounded-xl px-5 py-3.5 text-sm font-bold transition-colors active:bg-white/20 flex items-center justify-center">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Later List */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Later</h2>
            <div className="flex flex-col gap-3">
              <div className="bg-card border border-border/60 hover:border-border rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-[0.98] cursor-pointer shadow-sm">
                <div className="flex flex-col items-center justify-center w-14 h-14 bg-muted/40 rounded-xl shrink-0 border border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">May</span>
                  <span className="text-xl font-black leading-none text-foreground tracking-tighter mt-0.5">12</span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-sm font-bold truncate">Tuesday Smash & Skills</span>
                    <div className="w-2 h-2 rounded-full bg-secondary shrink-0" title="Confirmed"></div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                    <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> 20:00</div>
                    <div className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Insportz Club</span></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Past Expandable */}
          <section className="mt-2">
            <Collapsible open={isPastOpen} onOpenChange={setIsPastOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 border border-transparent hover:border-border/50 rounded-2xl text-sm font-semibold text-muted-foreground transition-all group">
                  <span>Show past & cancelled (1)</span>
                  {isPastOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 pb-1">
                <div className="bg-card border border-border/40 rounded-2xl p-4 flex items-center gap-4 opacity-70">
                  <div className="flex flex-col items-center justify-center w-14 h-14 bg-muted/30 rounded-xl shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Apr</span>
                    <span className="text-xl font-black leading-none text-muted-foreground tracking-tighter mt-0.5">21</span>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="text-sm font-bold text-muted-foreground truncate line-through decoration-muted-foreground/30">Tuesday Casual Drop-in</span>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase font-bold tracking-wider shrink-0 border-destructive/30 text-destructive/70 bg-destructive/5 rounded-md">Cancelled</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                      <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> 19:00</div>
                      <div className="flex items-center gap-1.5 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Nad Al Sheba</span></div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

        </main>
      </div>
    </div>
  );
}
