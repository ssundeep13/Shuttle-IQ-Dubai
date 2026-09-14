// IQ Pass — the one switch. Off by default; only the exact string 'true'
// turns it on. Every pack surface (routes, scheduler jobs, payload keys, the
// webhook pack lookup) checks this so the flag-off app is byte-identical to
// the app before IQ Pass existed.
export function isIqPassEnabled(): boolean {
  return process.env.IQ_PASS_ENABLED === 'true';
}
