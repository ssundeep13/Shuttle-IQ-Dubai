// Auto-fill court cost from the venue price book (Phase 1 gate d). Shared by the create
// path (POST /api/sessions/unified) and the edit path (PATCH /api/marketplace/sessions/:id)
// so the formula lives in ONE place.
//
// Name-match (gate d approach a): the venue is resolved by NAME. Court cost (fils) =
// venue.courtRateFilsPerHour × courtCount × sessionDurationHours(startTime, endTime).
// Never guess — 0 with a logged reason when there's no venue match, the rate is 0/unset,
// or the duration is NaN (endTime <= startTime).
import { sessionDurationHours } from "@shared/sessionTime";
import { storage } from "./storage";

export async function autoFillCourtCostFils(
  venueName: string,
  courtCount: number,
  startTime: string,
  endTime: string,
): Promise<{ courtCostFils: number; reason: string }> {
  const venue = await storage.getVenueByName(venueName);
  const hours = sessionDurationHours(startTime, endTime);
  if (!venue) return { courtCostFils: 0, reason: `no venue match for "${venueName}"` };
  if (!venue.courtRateFilsPerHour || venue.courtRateFilsPerHour <= 0) {
    return { courtCostFils: 0, reason: `venue "${venue.name}" rate not set (0)` };
  }
  if (!Number.isFinite(hours)) {
    return { courtCostFils: 0, reason: `duration NaN (start=${startTime} end=${endTime})` };
  }
  return {
    courtCostFils: Math.round(venue.courtRateFilsPerHour * courtCount * hours),
    reason: `${venue.courtRateFilsPerHour} × ${courtCount} × ${hours}h`,
  };
}
