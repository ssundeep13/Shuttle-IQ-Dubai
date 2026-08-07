// Gate 6 — when may a late-arriving AI result replace the displayed local
// lineup? Pure and dependency-free so the locked-while-pending race is unit-
// testable.
//
// The captain is NEVER overwritten:
//   - a persisted row (locked / confirm state) always wins — even a forced
//     adoption cannot touch it (those branches render from the row, and this
//     guard makes the rule explicit);
//   - any in-progress edit (composed swap, open swap slot, cycled option)
//     keeps the local display; the AI result waits behind a one-tap
//     "Use AI pick" that clears the edits — clearing them is what adopts.
export function shouldAdoptAiResult(state: {
  hasPersistedRow: boolean;
  hasComposedEdit: boolean;
  swapSlotOpen: boolean;
  cycledIndex: number;
}): boolean {
  if (state.hasPersistedRow) return false;
  return !state.hasComposedEdit && !state.swapSlotOpen && state.cycledIndex === 0;
}
