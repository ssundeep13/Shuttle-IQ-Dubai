// Player Challenges C4.1 — head-to-head panel copy. Pure, shared so the
// server and the panel agree on wording; tested in tests/challenges-head-to-head.test.tsx.
import { firstName } from './challengeViews';

export interface HeadToHeadRecord {
  met: number;
  myWins: number;
  theirWins: number;
}

const EN_DASH = '–';

/** "Met 3 times · Akhila leads 2–1" | "… · You lead 2–1" | "… · Level 1–1" | "You haven't met yet." */
export function recordLine(rec: HeadToHeadRecord, theirFirstName: string): string {
  if (rec.met <= 0) return "You haven't met yet.";
  const met = rec.met === 1 ? 'Met once' : `Met ${rec.met} times`;
  if (rec.myWins > rec.theirWins) return `${met} · You lead ${rec.myWins}${EN_DASH}${rec.theirWins}`;
  if (rec.theirWins > rec.myWins) return `${met} · ${theirFirstName} leads ${rec.theirWins}${EN_DASH}${rec.myWins}`;
  return `${met} · Level ${rec.myWins}${EN_DASH}${rec.theirWins}`;
}

/** "You 68 · Akhila 74" */
export function scoreLine(myScore: number, theirName: string, theirScore: number): string {
  return `You ${myScore} · ${firstName(theirName)} ${theirScore}`;
}
