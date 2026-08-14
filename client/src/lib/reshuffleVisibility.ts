/**
 * Gate 2 (audit G6) — where the "Reshuffle with AI" action may appear.
 *
 * A pure predicate so the matrix is unit-testable (same shape as
 * shouldAdoptAiResult, which this deliberately does NOT touch).
 *
 * The rules, from the Aug 8 design:
 *  - ephemeral suggestions and the full-recycle state: visible
 *  - LOCKED rows: only inside the Edit expansion, never on a collapsed lock
 *  - hidden while "Use AI pick" is offered (that button IS the AI result;
 *    two competing AI affordances in one row is the collision case)
 *  - hidden on a captain-composed lineup (Gate 1) — reshuffling someone's
 *    hand-built four is out of scope for this gate; hide and flag
 *  - requires AI mode on, and nothing already in flight
 */
export type ReshufflePanel = 'ephemeral' | 'full-recycle' | 'locked' | 'other';

export interface ReshuffleVisibilityInput {
  panel: ReshufflePanel;
  aiModeEnabled: boolean;
  /** the locked panel's Edit expansion is open */
  expanded: boolean;
  /** an AI result landed but is held behind "Use AI pick" */
  aiLandedButHeld: boolean;
  /** the captain hand-composed / slot-swapped this lineup */
  composed: boolean;
}

export function shouldShowReshuffle(input: ReshuffleVisibilityInput): boolean {
  const { panel, aiModeEnabled, expanded, aiLandedButHeld, composed } = input;
  if (!aiModeEnabled) return false;
  if (aiLandedButHeld) return false; // "Use AI pick" owns the row
  if (composed) return false;        // captain's own lineup — out of scope
  if (panel === 'ephemeral' || panel === 'full-recycle') return true;
  if (panel === 'locked') return expanded; // inside Edit only
  return false;
}
