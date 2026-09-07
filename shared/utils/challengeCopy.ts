// Player Challenges — the feed-card copy, in ONE place so the server headline
// (notifications, feedEventHeadline) and the client card can never disagree.
// Inputs are display names and numbers only; never DB enums.

export function challengeAcceptedHeadline(p: { challengerName: string; challengedName: string }): string {
  return `${p.challengerName} challenged ${p.challengedName}`;
}

/** "Dev beat Reena 21–17 · Challenge settled" — en dash between scores, middle dot before the label. */
export function challengeSettledHeadline(p: { winnerName: string; loserName: string; winnerScore: number; loserScore: number }): string {
  return `${p.winnerName} beat ${p.loserName} ${p.winnerScore}–${p.loserScore} · Challenge settled`;
}
