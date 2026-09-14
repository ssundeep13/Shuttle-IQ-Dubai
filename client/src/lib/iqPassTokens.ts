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
  // ink scale shared with the rest of the marketplace (no new drift)
  ink: '#1A1F2B',
  inkSub: '#5C6577',
  line: 'rgba(0, 30, 70, 0.10)',
} as const;

/** Inter — the app loads it as --font-sans (client/src/index.css). */
export const IQP_FONT = 'var(--font-sans)';
