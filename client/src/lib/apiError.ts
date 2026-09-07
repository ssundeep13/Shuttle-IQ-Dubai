/** The server's `{ error }` text out of whatever apiRequest threw — a plain
 *  Error whose message may wrap the JSON body — or the raw message. */
export function apiErrorText(err: unknown, fallback = 'Something went wrong'): string {
  const anyErr = err as { error?: unknown; message?: unknown };
  if (typeof anyErr?.error === 'string') return anyErr.error;
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : '';
  const json = msg.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const parsed = JSON.parse(json[0]);
      if (typeof parsed?.error === 'string') return parsed.error;
    } catch {}
  }
  return msg || fallback;
}
