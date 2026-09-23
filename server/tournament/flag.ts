// TOURNAMENT_ENABLED — default off. Only the exact string 'true' turns it on.
// While off: every tournament route answers the same JSON 404 as an unknown
// /api path, no scheduler job or webhook branch runs, and no existing payload
// gains a key, so the app is byte-identical to before.
export function isTournamentEnabled(): boolean {
  return process.env.TOURNAMENT_ENABLED === 'true';
}

/**
 * TOURNAMENT_PREVIEW_USER_IDS — comma-separated marketplace user ids that may see
 * and register before the open (the pre-open real-money test). Unset → nobody.
 */
export function previewUserIds(): Set<string> {
  return new Set((process.env.TOURNAMENT_PREVIEW_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}
