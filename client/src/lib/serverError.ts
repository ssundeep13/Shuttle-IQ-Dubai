// The request layer (lib/queryClient.ts throwIfResNotOk) throws a PLAIN
// { error, status, code } object, not an Error. Reading `.message` off it is
// undefined, which rendered an EMPTY toast description — the user saw only the
// bare title and never learned why (Gate G1 incident, then again on login).
//
// One definition, shared. Prefer the server's own copy, then an Error's
// message, then a fallback that is never empty.
export function serverErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  const e = error as { error?: unknown; message?: unknown } | null | undefined;
  if (e && typeof e === 'object') {
    if (typeof e.error === 'string' && e.error.trim()) return e.error;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  return 'Something went wrong — please try again.';
}
