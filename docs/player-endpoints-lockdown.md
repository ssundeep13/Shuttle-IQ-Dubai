# Player endpoints lockdown

Branch `railway-migration`. Gate 0 diagnosis 2026-09-09 found that several routes
answered anyone with full `players` rows: email, phone, wallet balance, referral
code, tier-candidate fields, for all ~494 players.

## Gate 1 — shipped 2026-09-09 (commit "Lock down player endpoints (Gate 1)")

| Route | Before | After |
|---|---|---|
| `GET /api/players` | no auth, full rows | `requireAuth` + `requireCaptain` (admin, super_admin, captain) — the live-session screen, Add Player modal, Merge tool, Player Registry and Sessions Management read it; captains run sessions |
| `GET /api/players/search?q=` | no auth, full rows | `requireAuth` + `requireAdmin` — no caller in the codebase; kept for admin tooling |
| `GET /api/players/public` | did not exist | new, no auth, exactly `id, name, shuttleIqId, level, skillScore, gamesPlayed, wins` — the projection the marketplace Rankings all-time mode reads (it used to read the full rows) |
| `GET /api/marketplace/search-players?q=` | authed; response already limited to five keys; matched on **email and phone** too via the shared `storage.searchPlayers`, an existence oracle | shared search matches on name and ShuttleIQ id only; response mapped through `publicPlayerSearchResult` = exactly `id, name, shuttleIqId, level, skillScore` |
| `GET /api/marketplace/admin/search-players` | admin, own `searchPlayersWithContact` with email/phone matching | unchanged (admin-only branch) |

Handlers live in `server/playerRoutes.ts` so tests mount them on a throwaway
express app behind the real middleware and hit them over HTTP
(`tests/player-endpoints-lockdown.test.ts`). The captain allow-list pin in
`tests/captain-role.test.ts` is 35 (34 + `GET /api/players`).

Client change: `client/src/pages/marketplace/Rankings.tsx` all-time query key
`['/api/players']` → `['/api/players/public']`; nothing else. Route order: the
public route is registered before `/api/players/:id` so the param route cannot
swallow "public".

## Gate 1b — logged, not started

Still unauthenticated and still returning full `players` rows (or embedding
them), to be handled in a follow-up gate with the same projection approach:

1. `GET /api/players/:id` (`server/routes.ts`) — full row by id.
2. `GET /api/players/:id/stats` — `PlayerStats.player` is the full row; read by
   the public profile, Dashboard, MyScores, GameHistory, PersonalityCard and
   Profile pages.
3. `GET /api/stats/week` — spreads full rows plus week stats; Rankings "this week".
4. `GET /api/stats/month/:year/:month` — same for the month; Rankings "this month".
5. `GET /api/stats/most-improved` — Rankings "most improved".

Rankings reads only `id, name, shuttleIqId, level, skillScore, gamesPlayed, wins`
(plus the per-window counters) from those responses, so the same seven-field
projection plus the window counters would serve them. The profile pages need
`PlayerStats.player` trimmed to the display fields.
