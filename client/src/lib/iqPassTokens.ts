// IQ Pass screens — brand tokens per the IQ Pass brief (Sandeep, 2026-09-14):
// the brief's navy, teal and beige, set in Inter. The app-wide MKT tokens in
// pages/marketplace/LandingComponents.tsx carry the Design-Gate-2 values
// (#002C84 / #F2ECE1); that drift is logged in docs/iq-pass/PROGRESS.md under
// "Found, not fixed" and is deliberately NOT changed here. This is the ONLY
// place the IQ Pass values are written — every IQ Pass screen imports IQP and
// never inlines a hex literal (the customer-layer sweep test bans the brief's
// literals inside pages/marketplace and components/marketplace).
export const IQP = {
  navy: '#003E8C',
  teal: '#006B5F',
  cream: '#F5EFE0',
  white: '#FFFFFF',
  // Gate 11: the two muted derivatives of the brand pair, for venue rails and tiles.
  // Both keep white text above 4.5:1 (navyMuted 6.0:1, tealMuted 4.7:1 on white text).
  navyMuted: '#4F6A9A',
  tealMuted: '#3E7F76',
  // ShuttleIQ League banner (Sandeep, 2026-09-24): teal text/fills ON the navy card (the brand teal
  // above is too dark on navy), and the amber "Full · waitlist n/2" state.
  tealOnNavy: '#5DCAA5',
  amber: '#F2B84B',
  // ink scale shared with the rest of the marketplace (no new drift)
  ink: '#1A1F2B',
  inkSub: '#5C6577',
  line: 'rgba(0, 30, 70, 0.10)',
} as const;

/** Inter — the app loads it as --font-sans (client/src/index.css). */
export const IQP_FONT = 'var(--font-sans)';

/**
 * The four venue colours (Gate 11): brand navy and teal plus their two muted
 * derivatives. Every IQ Pass surface reads a venue's colour from the shared map in
 * client/src/lib/venueColours.ts, never from here directly.
 */
export const IQP_VENUE_PALETTE: readonly string[] = [IQP.navy, IQP.teal, IQP.navyMuted, IQP.tealMuted] as const;
