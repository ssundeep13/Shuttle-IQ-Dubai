// Gate 3 (cross-court dedup) — choose the suggestion pool for ONE court's
// planning view. Pure and dependency-free so the fallback rule is unit-
// testable without a database.
//
// Two tiers:
//   STRICT: players held by ANY other court's open row (auto-locked
//   included) plus the client-seeded excludeIds (earlier courts' displayed
//   ephemeral picks — the server can't see those across requests) are out.
//   FALLBACK: if strict leaves fewer than 4 in-band players, re-admit
//   everything the old behavior allowed (auto-locked treated free, no
//   excludes) — a duplicate suggestion beats a false "no players" state.
// sharedPool is true only when the fallback actually re-admitted someone,
// so the UI chip never shows on a genuinely insufficient pool.
// strictEligibleCount (Gate 4, display-only) carries how many in-band
// players survived the strict tier: 0 with sharedPool means FULL recycle —
// the UI shows an honest "all waiters are booked" state instead of a
// recycled lineup; 1-3 is partial overlap and keeps the Shared-pool chip.
export function chooseSuggestionPool(input: {
  queue: string[];
  sittingOut: Set<string>;
  ownCourtPlayerIds: string[];
  strictClaimed: Set<string>;
  legacyClaimed: Set<string>;
  excludeIds: Set<string>;
  passesBand: (id: string) => boolean;
}): { waiterIds: string[]; currentIds: string[]; sharedPool: boolean; strictEligibleCount: number } {
  const queueSet = new Set(input.queue);
  const build = (claimed: Set<string>, useExcludes: boolean) => {
    const blocked = (id: string) =>
      claimed.has(id) || (useExcludes && input.excludeIds.has(id));
    return {
      waiterIds: input.queue.filter(id => !input.sittingOut.has(id) && !blocked(id)),
      currentIds: input.ownCourtPlayerIds.filter(id =>
        !queueSet.has(id) && !input.sittingOut.has(id) && !blocked(id)),
    };
  };
  const strict = build(input.strictClaimed, true);
  const strictInBand = [...strict.waiterIds, ...strict.currentIds].filter(input.passesBand);
  if (strictInBand.length >= 4) return { ...strict, sharedPool: false, strictEligibleCount: strictInBand.length };
  // Gate B (D2 spread ruling): before dropping the excludes wholesale, try the
  // legacy claims WITH excludes intact — when that still fills a lineup, the
  // earlier panels' displayed anchors stay out, so the same pair never fronts
  // two panels unless mathematically unavoidable. The strict tier above is
  // untouched; this only refines which players the FALLBACK re-admits.
  const spread = build(input.legacyClaimed, true);
  const spreadInBand = [...spread.waiterIds, ...spread.currentIds].filter(input.passesBand);
  if (spreadInBand.length >= 4) {
    return { ...spread, sharedPool: spreadInBand.length > strictInBand.length, strictEligibleCount: strictInBand.length };
  }
  const legacy = build(input.legacyClaimed, false);
  const legacyInBand = [...legacy.waiterIds, ...legacy.currentIds].filter(input.passesBand);
  return { ...legacy, sharedPool: legacyInBand.length > strictInBand.length, strictEligibleCount: strictInBand.length };
}
