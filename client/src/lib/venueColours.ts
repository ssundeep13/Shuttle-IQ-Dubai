// Shared venue-colour map (IQ Pass Gate 11). One colour per venue, the same on every
// surface: the picker card rail and slot tiles, the review mini-month, the Dashboard and
// the My games strip and rows. Four colours only — brand navy and teal plus their two muted
// derivatives (client/src/lib/iqPassTokens.ts). Venues that host sessions today are pinned
// by name so they never change colour; anything new gets a stable hash into the same four.
import { IQP, IQP_VENUE_PALETTE } from './iqPassTokens';

export const VENUE_COLOUR_MAP: Readonly<Record<string, string>> = {
  'Smash Sports Academy': IQP.navy,
  'Bright Riders School Dubai': IQP.teal,
  'BASELINE SPORTS ACADEMY DIP': IQP.navyMuted,
  'Fire Rallies Sports Academy LLC': IQP.tealMuted,
  'Al Manara Sports Hall': IQP.navy,
  'Al Raya Sports Hall': IQP.teal,
  'Rochester Institute of Technology': IQP.navyMuted,
};

const normalise = (name: string): string => String(name ?? '').trim().replace(/\s+/g, ' ');

/** The venue's colour: pinned by name, otherwise a stable hash into the four-colour palette. */
export function venueColour(venueName: string): string {
  const key = normalise(venueName);
  const pinned = VENUE_COLOUR_MAP[key];
  if (pinned) return pinned;
  let h = 0;
  for (const ch of key.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return IQP_VENUE_PALETTE[h % IQP_VENUE_PALETTE.length];
}

/** Text colour on a venue tile — all four colours carry white text. */
export const VENUE_TILE_TEXT = IQP.white;
