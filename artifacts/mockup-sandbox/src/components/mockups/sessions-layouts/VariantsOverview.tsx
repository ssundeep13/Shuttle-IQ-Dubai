/**
 * Sessions Page — Layout Variants Overview
 *
 * This composition component provides a reproducible, code-level representation
 * of the 3 layout exploration variants for the BookSessions page.
 *
 * Canvas arrangement:
 *   - Variant A (TimelineList)    — canvas shape: sessions-variant-a  — x=-550, y=350, w=920, h=820
 *   - Variant B (WeeklySpotlight) — canvas shape: sessions-variant-b  — x=420,  y=350, w=920, h=820
 *   - Variant C (SessionFeed)     — canvas shape: sessions-variant-c  — x=1390, y=350, w=920, h=820
 *
 * Preview URLs (mockup sandbox):
 *   /preview/sessions-layouts/TimelineList
 *   /preview/sessions-layouts/WeeklySpotlight
 *   /preview/sessions-layouts/SessionFeed
 */

import React from 'react';
import { Calendar, LayoutList, CalendarDays, AlignJustify, ArrowRight } from 'lucide-react';

const VARIANTS = [
  {
    id: "A",
    name: "Timeline List",
    component: "TimelineList",
    icon: CalendarDays,
    hypothesis: "Date becomes the primary spatial anchor. Sessions grouped by date with a scrollable date-picker strip. Horizontal cards with a dark navy left date panel and light content on the right.",
    features: [
      "Scrollable date-picker strip (all available dates)",
      "Search bar for venues/locations",
      "Date-grouped sections with session count badge",
      "Horizontal card: navy date panel + content panel",
      "AED price + View & Book CTA at bottom-right",
    ],
    bestFor: "Users who plan ahead by date",
  },
  {
    id: "B",
    name: "Weekly Spotlight",
    component: "WeeklySpotlight",
    icon: LayoutList,
    hypothesis: "Focus on one day at a time. A 7-day week strip filters sessions to the selected day, shown as tall feature cards in a 2-column grid with a gradient header.",
    features: [
      "7-day week strip with session count badges",
      "Filtered to selected day — clear empty state",
      "Tall feature cards with primary-to-secondary gradient header",
      "Date shown prominently in card header",
      "2-column grid layout",
    ],
    bestFor: "Users deciding which day to play",
  },
  {
    id: "C",
    name: "Session Feed",
    component: "SessionFeed",
    icon: AlignJustify,
    hypothesis: "Flat, frictionless scrolling. No date picker needed. Sessions flow as a continuous feed with inline date chip separators. Compact full-width cards with side-by-side layout.",
    features: [
      "No date picker — single search bar only",
      "Inline date chip separators between date groups",
      "Full-width compact cards (details left, price+CTA right)",
      "Left accent border for skill level (purple/blue/green/teal)",
      "Optimized for mobile reading — narrower container",
    ],
    bestFor: "Users who want to see what's coming up next",
  },
];

export function VariantsOverview() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-5xl mx-auto px-5 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-6 h-6 text-secondary" />
            <h1 className="text-2xl font-bold text-foreground">Sessions Page — Layout Variants</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Three distinct structural layout explorations for the BookSessions page. All variants share the same data model, 
            booking states, navigation routes, and ShuttleIQ brand tokens — only the spatial organization and information 
            hierarchy differ.
          </p>
        </div>

        {/* Fixed Constraints Banner */}
        <div className="bg-muted/50 rounded-xl border border-border p-4 mb-8 text-sm text-muted-foreground">
          <strong className="text-foreground">Fixed across all variants:</strong>{" "}
          All data fields (title, date, time, venue, courts, capacity, description, price, CTA) · 
          Booking states (Booked green, Full red+disabled, Low orange, Available) · 
          Navigation via <code className="bg-muted px-1 rounded text-xs">/marketplace/sessions/:id</code> · 
          ShuttleIQ brand token palette (bg-background, bg-primary, bg-secondary, text-foreground, etc.)
        </div>

        {/* Variant Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {VARIANTS.map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.id} className="bg-card rounded-xl border border-border flex flex-col overflow-hidden">
                {/* Card Header */}
                <div className="bg-primary text-primary-foreground p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wider">Variant {v.id}</span>
                  </div>
                  <h2 className="text-lg font-bold">{v.name}</h2>
                </div>

                {/* Card Body */}
                <div className="p-4 flex flex-col flex-grow">
                  <p className="text-sm text-muted-foreground mb-4 italic">
                    "{v.hypothesis}"
                  </p>

                  <ul className="space-y-1.5 mb-5 flex-grow">
                    {v.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-secondary mt-0.5">·</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-3">
                      <strong className="text-foreground">Best for:</strong> {v.bestFor}
                    </p>
                    <a
                      href={`/preview/sessions-layouts/${v.component}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium w-full justify-center"
                    >
                      Open {v.name} Preview
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Canvas Layout Documentation */}
        <div className="mt-8 bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Canvas Placement (3 iframes side-by-side)</h3>
          <div className="font-mono text-xs text-muted-foreground space-y-1">
            <p>sessions-variant-a  TimelineList    x=-550  y=350  w=920  h=820</p>
            <p>sessions-variant-b  WeeklySpotlight  x=420   y=350  w=920  h=820</p>
            <p>sessions-variant-c  SessionFeed     x=1390  y=350  w=920  h=820</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VariantsOverview;
