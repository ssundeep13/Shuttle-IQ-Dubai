// Duplicate-prevention matching (Gate P1). Pure helpers shared by the
// same-person checks on guest check-in and admin player-add, and by the
// full-name policy on signup. Fuzzy matching is a trigram Dice coefficient
// in TS rather than pg_trgm: the player table is small, the checks run only
// on rare admin-side creates, and a pure function stays unit-testable
// without a production extension.
import { getSkillTier, getTierDisplayName } from './skillUtils';

/** Trim + collapse internal whitespace. Casing untouched (storage form). */
export function normalizeName(raw: string): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ');
}

/** Case-insensitive comparison key for names. */
export function nameKey(raw: string): string {
  return normalizeName(raw).toLowerCase();
}

/**
 * Phone comparison key: digits only, last 9 — absorbs +971 / 0 / spacing
 * variants of UAE numbers. Null when too short to be a real number.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

/** Full-name policy: at least two words after normalization. */
export function isFullName(raw: string): boolean {
  return nameKey(raw).split(' ').filter(Boolean).length >= 2;
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** Dice coefficient over character trigrams of the normalized names (0..1). */
export function nameSimilarity(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ta = trigrams(ka);
  const tb = trigrams(kb);
  let shared = 0;
  ta.forEach((g) => {
    if (tb.has(g)) shared++;
  });
  return (2 * shared) / (ta.size + tb.size);
}

export const FUZZY_NAME_THRESHOLD = 0.5;

export interface MatchablePlayer {
  id: string;
  name: string;
  phone?: string | null;
  gamesPlayed: number;
  skillScore: number;
  lastPlayedAt?: Date | string | null;
}

export type CandidateMatchType = 'phone' | 'name-exact' | 'name-fuzzy';

/** Receipt shown to the captain/admin. `tier` is a DISPLAY label, never a DB enum. */
export interface PlayerCandidate {
  id: string;
  name: string;
  gamesPlayed: number;
  tier: string;
  lastPlayedAt: string | null;
  matchType: CandidateMatchType;
  similarity: number;
}

const MATCH_RANK: Record<CandidateMatchType, number> = {
  phone: 0,
  'name-exact': 1,
  'name-fuzzy': 2,
};

/**
 * Rank existing players that plausibly ARE the person being created.
 * Phone match (strongest) > exact normalized name > fuzzy name. A
 * single-word input also matches players sharing that first word — the
 * guest-typed-first-name-only case. Empty input or no plausible match
 * returns [] so callers add zero friction.
 */
export function findPlayerCandidates(
  pool: MatchablePlayer[],
  input: { name: string; phone?: string | null },
  opts: { max?: number } = {},
): PlayerCandidate[] {
  const max = opts.max ?? 3;
  const inKey = nameKey(input.name);
  const inPhone = phoneKey(input.phone);
  if (!inKey && !inPhone) return [];
  const inWords = inKey.split(' ').filter(Boolean);

  const out: PlayerCandidate[] = [];
  for (const p of pool) {
    const pKey = nameKey(p.name);
    let matchType: CandidateMatchType | null = null;
    let similarity = 0;
    if (inPhone && phoneKey(p.phone) === inPhone) {
      matchType = 'phone';
      similarity = 1;
    } else if (inKey && pKey === inKey) {
      matchType = 'name-exact';
      similarity = 1;
    } else if (inKey) {
      similarity = nameSimilarity(inKey, pKey);
      const firstWordOnly =
        inWords.length === 1 && pKey.split(' ')[0] === inWords[0];
      if (similarity >= FUZZY_NAME_THRESHOLD || firstWordOnly) {
        matchType = 'name-fuzzy';
      }
    }
    if (!matchType) continue;
    out.push({
      id: p.id,
      name: p.name,
      gamesPlayed: p.gamesPlayed,
      tier: getTierDisplayName(getSkillTier(p.skillScore)),
      lastPlayedAt: p.lastPlayedAt ? new Date(p.lastPlayedAt).toISOString() : null,
      matchType,
      similarity,
    });
  }

  out.sort(
    (a, b) =>
      MATCH_RANK[a.matchType] - MATCH_RANK[b.matchType] ||
      b.similarity - a.similarity ||
      b.gamesPlayed - a.gamesPlayed,
  );
  return out.slice(0, max);
}
