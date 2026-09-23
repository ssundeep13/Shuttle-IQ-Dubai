// TOURNAMENT_ENABLED — default off. Only the exact string 'true' turns it on.
// While off: every tournament route answers the same JSON 404 as an unknown
// /api path, no scheduler job or webhook branch runs, and no existing payload
// gains a key, so the app is byte-identical to before.
export function isTournamentEnabled(): boolean {
  return process.env.TOURNAMENT_ENABLED === 'true';
}
