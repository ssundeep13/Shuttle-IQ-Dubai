// Human error copy for captain surfaces. The request layer (queryClient
// throwIfResNotOk) extracts the server's own copy into err.error and
// carries the structured payload; these helpers guarantee raw JSON never
// reaches a toast and give conflict errors their names.

export type ApiError = {
  error?: string;
  message?: string;
  status?: number;
  code?: string;
  payload?: { conflicts?: Array<{ playerId?: string; name?: string; reason?: string }> } & Record<string, unknown>;
};

// A lineup-claim conflict: 409 or a payload carrying per-player conflicts.
export function isConflictError(err: unknown): boolean {
  const e = err as ApiError;
  return e?.status === 409 || Array.isArray(e?.payload?.conflicts);
}

// Player NAMES from a conflict payload (server enriches them; a client
// resolver covers older payloads). PlayerIds are never shown.
export function conflictNames(err: unknown, nameOf?: (id: string) => string | undefined): string[] {
  const conflicts = (err as ApiError)?.payload?.conflicts;
  if (!Array.isArray(conflicts)) return [];
  return conflicts
    .map(c => c?.name || (nameOf && c?.playerId ? nameOf(c.playerId) : undefined))
    .filter((n): n is string => !!n);
}

// The one line every captain toast shows when something fails: the
// server's own copy when it reads like a sentence, the fallback otherwise.
// Anything that still looks like JSON is swallowed.
export function friendlyMessage(err: unknown, fallback: string): string {
  const e = err as ApiError;
  const raw =
    typeof e?.error === 'string' ? e.error :
    typeof e?.message === 'string' ? e.message : '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('"error"')) {
    return fallback;
  }
  return trimmed;
}

// Standard copy for the self-healing conflict path.
export function conflictCopy(names: string[]): string {
  if (names.length === 0) return 'Some players were just placed on another court — refreshing this suggestion';
  const list = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  return `${list} ${names.length === 1 ? 'was' : 'were'} just placed on another court — refreshing this suggestion`;
}
