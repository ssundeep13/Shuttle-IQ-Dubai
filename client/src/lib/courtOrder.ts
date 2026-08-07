import { CourtWithPlayers } from "@shared/schema";

// Fixed court order: cards NEVER move — status changes card contents, not
// card position. Server orders too; this is the belt-and-braces. Shared by
// the courts grid and the NEXT GAMES deck so both always agree on position.
function courtNumber(name: string): number {
  const n = parseInt(name.replace(/\D+/g, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

export function sortCourts(courts: CourtWithPlayers[]): CourtWithPlayers[] {
  return [...courts].sort(
    (a, b) => courtNumber(a.name) - courtNumber(b.name) || a.name.localeCompare(b.name),
  );
}
