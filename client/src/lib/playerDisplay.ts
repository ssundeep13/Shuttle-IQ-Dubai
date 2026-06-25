// Shared player-display helpers. Extracted verbatim from SessionDetails.tsx
// (multi-tenancy Gate 2 — pure move) so GuestRow and SessionDetails share one
// source of truth. Values unchanged.

export const LEVEL_COLORS: Record<string, string> = {
  novice: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  beginner: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  intermediate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  lower_intermediate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  upper_intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  competitive: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  advanced: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  professional: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
