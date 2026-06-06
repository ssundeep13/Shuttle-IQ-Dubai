# ShuttleIQ — Project Reference & Work Log

> Single source of truth for app architecture, infrastructure, and the work done during the Railway migration / domain cutover.
> **Last updated:** 2026-06-06. **Secrets are referenced by name/location only — never pasted here.**

---

## 1. What this app is

**ShuttleIQ** — a badminton platform for the UAE with two halves:
1. **Marketplace** — players book badminton sessions, pay via Ziina, view skill scores/rankings, get tagged by peers, refer friends. Public-facing at **https://shuttleiq.ai**.
2. **Internal admin / court management** — courts, queues, matchmaking, game results, player stats, expenses. Accessed at `/admin/login`.

Also wrapped as a **native Android app** via Capacitor, and installable as a **PWA**.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript, wouter (routing), TanStack Query, shadcn/ui, Tailwind CSS, framer-motion, recharts, lucide-react |
| Backend | Express + TypeScript, Drizzle ORM |
| DB | PostgreSQL (Railway, PG 18.4) |
| Auth | JWT (access + refresh), bcrypt password hashing, Google OAuth (marketplace) |
| Payments | Ziina (hosted checkout + webhooks + refunds) |
| Native | Capacitor (Android), custom deep-link scheme `com.shuttleiq.app` |
| PWA | Service worker (`client/public/sw.js`), `manifest.webmanifest` |
| Email | `emailClient` (booking confirmations, guest emails, refunds, verification) |

**Repo:** GitHub `ssundeep13/Shuttle-IQ-Dubai`. Package name `rest-express`.

**npm scripts:**
```
dev    : NODE_ENV=development tsx server/index.ts
build  : vite build && esbuild server/index.ts ... --outdir=dist
start  : NODE_ENV=production node dist/index.js
check  : tsc                      # typecheck (has pre-existing errors unrelated to recent work)
db:push: drizzle-kit push         # ⚠️ INTENTIONALLY NOT USED — schema migrated via manual ALTER/scripts
test   : vitest run               # 94 tests, all passing
```

---

## 3. Infrastructure

### Hosting — Railway
- **Project:** ShuttleIQ — `f6a94abd-bdce-4d72-83cb-ac688f86544f`
- **Environment:** production — `895e5ecd-6fa6-4333-8ee5-886ee949d296`
- **Services:**
  - **shuttleiq-app** (web) — `65716648-2a82-4606-888c-18b005a472a1`, region `iad`, builder RAILPACK
  - **Postgres** (DB), volume at `/var/lib/postgresql/data`
- **Railway-provided domain:** `shuttleiq-app-production.up.railway.app`
- **Deploy branch:** **`railway-migration`** (Railway auto-deploys on push to this branch). **Do NOT touch `main` or the Replit branch.**

### Database — Railway Postgres (PG 18.4)
- **Public proxy (use from local/CI):** `caboose.proxy.rlwy.net:25452/railway`
- **Internal (in-container):** `postgres.railway.internal:5432/railway`
- Connection string is in **`.env` → `DATABASE_URL`** (local) and Railway service variables. Password not stored here.
- **Connect from this repo** (pattern used throughout):
  ```js
  import pg from './node_modules/pg/lib/index.js';
  const DST = readFileSync('.env','utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
  const c = new pg.Client({ connectionString: DST, ssl:{ rejectUnauthorized:false } });
  ```
  (`psql` is NOT installed on the dev box — use Node `pg`, or Docker `postgres:18`.)

### Original source DB — Neon (Replit production)
- **LIVE source:** `ep-morning-grass-aqycj441.c-8.us-east-1.aws.neon.tech/neondb` (PG 16.14), user `neondb_owner`.
- **STALE (do not use):** `ep-green-river-a45eel6m.us-east-1.aws.neon.tech` — a 26-day-old branch; ~290 fewer bookings. Caused confusion mid-migration.
- Railway data was migrated FROM the live Neon endpoint (see §7 and `docs/migration-runbook.md`).

---

## 4. Environment variables (names + meaning; values live in Railway / `.env`)

| Var | Current value / meaning |
|---|---|
| `DATABASE_URL` | Railway Postgres connection string |
| `REPLIT_DOMAINS` | **`shuttleiq.ai,shuttleiq-app-production.up.railway.app`** — `split(',')[0]` is the canonical base URL for Ziina returns, emails, OAuth |
| `CORS_ALLOWED_ORIGINS` | `https://localhost,http://localhost,capacitor://localhost` (native shell origins). Web/prod origins come from `REPLIT_DOMAINS` |
| `GOOGLE_CLIENT_ID` | `253093700547-…` (marketplace Google OAuth) |
| `GOOGLE_CLIENT_SECRET` | secret |
| `ZIINA_API_TOKEN` | `RVLF6QOo…` (Ziina REST API) |
| `ZIINA_WEBHOOK_SECRET` | HMAC-SHA256 secret for webhook signature verification |
| `TAP_PUBLIC_KEY` | `pk_test_…` (Tap payments, test) |
| `NATIVE_DEEPLINK_SCHEME` | optional; defaults to `com.shuttleiq.app` |
| `VITE_API_BASE` | **unset for web** → client uses relative same-origin API URLs. Set only for native Capacitor builds (points at Railway backend) |
| `RAILWAY_PUBLIC_DOMAIN` | `shuttleiq-app-production.up.railway.app` |

**Security constraints (standing):** never commit `.env`; stage only specifically named changed files; do NOT run `drizzle-kit push`; `railway-migration` branch only.

---

## 5. Domains & DNS

| Domain | Registrar / DNS | Status | Records |
|---|---|---|---|
| **shuttleiq.ai** | Cloudflare Registrar + Cloudflare DNS | ✅ **LIVE on Railway**, SSL VALID | `CNAME @ → ttgibxnh.up.railway.app` (grey-cloud/DNS-only, flattened to `A 69.46.46.72`); `TXT _railway-verify=railway-verify=932dfbeb…` |
| shuttleiq.org | Registered via **Replit** (name.com NS) | Still served by **Replit** | apex `A 34.111.179.208` (Replit proxy); `TXT replit-verify=83e867f2…`. Registered as Railway custom domain (id `b125b147-…`) but DNS not pointed |
| shuttleiqdubai.com | Registered via Replit (name.com NS) | Still served by **Replit** | Same Replit A/TXT. **Removed** from Railway custom domains (freed a slot for shuttleiq.ai) |

**Railway custom-domain facts learned:**
- Railway is **CNAME-only** — no A records, no static apex IP (the edge IP `66.33.22.1` an employee mentions is explicitly NOT guaranteed static; don't use it).
- Apex domains need **CNAME flattening / ALIAS** at the DNS host. **Cloudflare does this; name.com/Replit do not** — that's why `.ai` (Cloudflare) works and `.org`/`.com` (Replit) are stuck.
- **Plan limit: 2 custom domains per service.** Hit this when adding `shuttleiq.ai`; resolved by removing `shuttleiqdubai.com`.
- SSL is auto (Let's Encrypt) once DNS resolves; status enum: `VALIDATING_OWNERSHIP` → `VALID`.

**Domain management via Railway:**
- CLI: `railway domain <domain> --service shuttleiq-app --json` (adds + returns DNS records). CLI has **no remove** command.
- Remove / advanced: Railway **GraphQL API** at `https://backboard.railway.app/graphql/v2`, `Authorization: Bearer <token>`. Token is at **`~/.railway/config.json` → `.user.token`**. Mutations: `customDomainCreate`, `customDomainDelete(id)`. Query `customDomain(id, projectId)` for status.
  - shuttleiq.ai customDomain id: `820d74ed-59a7-40ab-93c2-eb45693cf3fe`

**Legacy-domain redirect (deployed):** first middleware in `server/index.ts` — 301-redirects `shuttleiq.org`/`shuttleiqdubai.com` (case-insensitive, full path+query preserved) → `https://shuttleiq.ai`. Inert until those domains point at Railway. `shuttleiq.ai` and `*.up.railway.app` pass through.

---

## 6. Auth & admin systems (TWO separate systems — important)

### A. Internal admin panel — `admin_users` table
- Login: `/admin/login` → `POST /api/auth/login` (email + password → bcrypt). JWT issued with `role`.
- Schema: `id, email (unique), password_hash (NOT NULL), role ('admin'|'super_admin'), created_at, last_login_at`.
- **Current members:** `ssundeep13@gmail.com` (super_admin), `arjun.aj.anand@gmail.com` (super_admin), `admin@shuttleiq.com` (admin).
- Seeded/rotated on startup: `seedAdminUser()`, `rotateDefaultAdminPassword()`, `ensureOwnerSuperAdmin()` in `server/routes.ts`.

### B. Marketplace role — `marketplace_users.role`
- Values: `player` (default) | `admin` | `super_admin`. Gates marketplace admin features (`server/routes.ts` checks `req.user.role`).
- **Current marketplace admins:** `akhilasenv@gmail.com` (Akhila Varakil) — **super_admin** (granted 2026-06-06; was `player`).
- ⚠️ Role is embedded in the JWT at login — a role change requires **log out / back in** to take effect.

### Google OAuth (marketplace only)
- `getGoogleOAuthClient()` / `getOAuthCanonicalDomain()` in `server/marketplace-routes.ts`.
- Canonical domain = first `.replit.app` domain in `REPLIT_DOMAINS`, else `REPLIT_DOMAINS[0]` → currently **`shuttleiq.ai`**.
- **OAuth redirect URI the app now sends:** `https://shuttleiq.ai/api/marketplace/auth/google/callback`
- ⚠️ **PENDING MANUAL ACTION:** this URI + JS origin `https://shuttleiq.ai` must be added in **Google Cloud Console → Credentials → OAuth client `253093700547-…`**, or Google login fails with `redirect_uri_mismatch`.
- Native OAuth return uses an allowlisted deep-link scheme (`oauthReturn.ts`, `buildOAuthCallbackRedirect`).

---

## 7. Database schema (36 tables)

**Key tables & post-migration row counts (2026-06-06):**

| Table | Rows | Notes |
|---|---|---|
| players | 190 | internal player profiles; `referrals.referrer_id → players.id` |
| marketplace_users | 189 | app accounts; `role`, `linked_player_id`. **5 onboarding cols dropped on Railway** (see below) |
| bookings | 859 | `session_id` (app-level), `amount_aed`, `payment_method` (default `ziina`), `spots_booked`, `ziina_payment_intent_id` |
| booking_guests | 1009 | `booking_id → bookings.id` (DB FK); `pending_payment_intent_id` holds GUEST Ziina intents |
| payments | 189 | ledger; `amount`, `status`, `ziina_payment_intent_id`, + 4 refund cols (`ziina_refund_id, refunded_amount, refunded_at, refund_status`) |
| bookable_sessions | 43 | marketplace sessions (price, capacity, venue) |
| sessions | 86 | internal court-management sessions |
| game_participants / game_results | 10928 / 2732 | match data |
| tags / player_tags / tag_suggestions | 37 / 638 / 3 | peer personality tags |
| referrals | 20 | referral program |

**KEEP tables** (Railway-origin; must NOT be overwritten by Neon import): `discount_codes` (1), `discount_code_uses` (0), `system_one_shot_migrations` (2).

**Schema drift Railway vs Neon (live):**
- Railway has 7 extra cols Neon lacks (all nullable or defaulted): `bookings.*`(discount), `marketplace_users.referral_nudge_dismissed_at`, `match_suggestions.includes_active_players`, `players.referral_milestone_5/10_emailed`, `referrals.triggering_booking_id/completion_method/clawed_back_at`.
- **Neon has 5 cols Railway dropped on purpose** (`scripts/drift-cleanup-2-drop-dead-columns.mjs`): `marketplace_users.onboarding_completed/experience/rallies/games/completed_at`. → marketplace_users imports only the **17 shared columns**.
- `payments` 4 refund cols were dropped then re-added on Railway; present on both now.

**Foreign keys (DB-enforced, 6):** `bookable_sessions.linked_session_id→sessions`, `booking_guests.booking_id→bookings`, `expenses.category_id→expense_categories`, `referrals.referrer_id→players`, `tag_suggestion_votes.suggestion_id→tag_suggestions`, `discount_code_uses.code_id→discount_codes`.

---

## 8. Payments — Ziina

- **Return URLs:** `buildZiinaReturnUrls()` in `server/ziinaReturn.ts` — base = `https://${REPLIT_DOMAINS.split(',')[0]}` (now `https://shuttleiq.ai`). Web: `…/marketplace/checkout/success|cancel`; native: `com.shuttleiq.app://checkout/…`.
- **Confirmation:** `confirmZiinaBookingByIntentId(intentId, status)` (booking path) and `confirmGuestByIntentId(intentId)` (extra-guest path) in `server/webhookHandler.ts`. Webhook + poll fallbacks both call these.
  - Guest intents live in `booking_guests.pending_payment_intent_id` — look up via `getBookingGuestByPendingPaymentIntentId`, NOT `getBookingByZiinaPaymentIntentId`.
- **`/confirm-guest` endpoint** (`marketplace-routes.ts`) — poll fallback for the add-guest redirect; calls `confirmGuestByIntentId` directly.
- **Refunds:** wallet-cap math in `refundMath.ts` (`computeZiinaRefundFils` — only refunds the cash portion, never wallet credit; AED→fils ×100). Webhook `refund.*` branch is source of truth for terminal refund state. `POST /api/.../refunds/:notificationId/process`.
  - ⚠️ **PENDING:** enable "Refund" permission on the Ziina API token (`RVLF6QOo…`) in the Ziina merchant dashboard before firing real refunds; test on sandbox first.
- **Webhook signature:** HMAC-SHA256 with `ZIINA_WEBHOOK_SECRET`; route registered BEFORE `express.json()` to read raw body.

---

## 9. PWA & service worker

- **Manifest:** `client/public/manifest.webmanifest` (NOT `manifest.json` — `/manifest.json` returns SPA HTML). Linked in `client/index.html`. Valid: `name/short_name ShuttleIQ`, `start_url "/"` (relative — resolves to current domain), `display standalone`, theme/bg `#0d2b45`, icons 192+512 (`purpose any maskable`).
- **Service worker:** `client/public/sw.js`, `CACHE_NAME = 'shuttleiq-v4'`. Network-first for assets/HTML, cache-first for icons. **Skips `/api/` and all non-GET requests** (line 38/45). Registered in `index.html` on web; **skipped in Capacitor native shell** (`window.Capacitor.isNativePlatform()`).
- **Install UX:** `useInstallPrompt()` (`client/src/hooks/use-install-prompt.ts`) **`preventDefault()`s `beforeinstallprompt`** → suppresses the browser's auto-prompt in favor of a custom button. `InstallAppBar` is **`hidden md:block` (desktop-only)** and mounted only in `MarketplaceLayout`, `CheckoutSuccess`, `CheckoutCancel`. → On mobile, no visible install prompt by design; use Chrome ⋮ → "Install app".
- **Installability: fully met** (HTTPS, valid manifest, real icons, SW w/ fetch handler). "No prompt" is the intentional intercept + desktop-only bar + Chrome engagement gating — not a misconfig.

**Stale-SW gotcha:** old pre-v4 service workers that lacked the non-GET guard tried `cache.put()` on a POST → throws → browser shows **"Failed to fetch"** on login while the server is healthy. Fix: hard-reload / unregister SW to pick up v4 (already deployed).

---

## 10. Key file map

```
server/
  index.ts              # app bootstrap; legacy-domain 301 redirect (FIRST mw), CORS, rate limits, /api/health
  routes.ts             # internal admin auth (/api/auth/login), admin seeding, admin routes
  marketplace-routes.ts # marketplace API: bookings, /confirm, /confirm-guest, Google OAuth, /bookings/mine
  webhookHandler.ts     # Ziina webhook + confirmZiinaBookingByIntentId + confirmGuestByIntentId + refund.* branch
  ziinaReturn.ts        # buildZiinaReturnUrls (success/cancel/failure, web + native scheme)
  oauthReturn.ts        # isSchemeAllowed, buildOAuthCallbackRedirect (native deep-link allowlist)
  refundMath.ts         # computeZiinaRefundFils, classifyRefundReentry (wallet-cap, idempotency)
  storage.ts            # Drizzle data access (getBookingGuestByPendingPaymentIntentId, getPaymentTotalsByBookingIds, …)
  scheduler.ts          # cron-ish jobs (reminders, guest emails)
shared/
  schema.ts             # Drizzle tables + types (adminUsers, marketplaceUsers, bookings, payments, booking_guests, …)
client/
  index.html            # manifest link + SW registration (native-skip guard)
  public/sw.js          # service worker v4
  public/manifest.webmanifest
  src/lib/queryClient.ts        # API_BASE from VITE_API_BASE (empty=relative); apiUrl()/apiRequest()
  src/contexts/AuthContext.tsx  # admin login fetch → /api/auth/login
  src/hooks/use-install-prompt.ts
  src/components/InstallAppBar.tsx
  src/pages/marketplace/MyScores.tsx, MyBookings.tsx, Dashboard.tsx, MarketplaceLayout.tsx
docs/
  migration-runbook.md  # full Neon→Railway migration runbook (Variant B Node scripts)
  PROJECT-REFERENCE.md  # this file
```

---

## 11. Common operations

- **Deploy:** commit to `railway-migration`, `git push origin railway-migration` → Railway auto-builds. Poll: `railway deployment list --json` (status BUILDING→SUCCESS).
- **Health check:** `curl -sf https://shuttleiq.ai/api/health` → `{"ok":true,...}` (or the `…up.railway.app` URL).
- **Run tests:** `npx vitest run` (94 tests).
- **DB query/script:** Node + `pg` reading `DATABASE_URL` from `.env` (see §3). `psql` not installed locally.
- **Set Railway env var:** `railway variables set "KEY=VALUE" --service shuttleiq-app` (auto-redeploys; `--skip-deploys` to suppress). API responses sometimes time out but still apply — verify with `railway variables list --kv`.
- **Check domain/cert status:** Railway GraphQL `customDomain(id, projectId)` → `status.certificateStatus` (`VALID` = issued) + `status.verified`.
- **Railway IDs:** project `f6a94abd-…`, service `65716648-…`, env `895e5ecd-…`.

---

## 12. Work log — this session (2026-06-06)

**Commits on `railway-migration` (newest first):**
- `52525e3` 301-redirect legacy domains (shuttleiq.org, shuttleiqdubai.com) → shuttleiq.ai (first middleware in `server/index.ts`).
- `a005438` My Bookings: show **total paid** summed from `payments` (new `getPaymentTotalsByBookingIds` + `totalPaidAed`); payment-method label "Card" → **"Ziina"**.
- `2f2fa8c` `/confirm-guest` fix: extract `confirmGuestByIntentId` and call it directly (guest intents use `pending_payment_intent_id`, not booking lookup).
- `9d51f76` MyScores hero: unified profile + skill-score card.
- `dec50ab` MyScores stat grid: remove Tags Received from grid → standalone full-width section.

**Non-commit operations performed:**
- **DB migration Neon→Railway (Variant B / Node):** backed up 3 KEEP tables → `keep_tables_backup_<ts>.json`; wiped 33 tables (single multi-table TRUNCATE); imported from live Neon (`ep-morning-grass`); verified all 36 tables match + KEEP unchanged (1/0/2). Scripts: `backup-keep-tables.mjs`, `restore-keep-tables.mjs`, `migrate.mjs`, `verify.mjs`; runbook in `docs/migration-runbook.md`.
- **Domain cutover to shuttleiq.ai:** removed `shuttleiqdubai.com` from Railway (freed slot), added `shuttleiq.ai` custom domain; user added Cloudflare CNAME+TXT (grey-cloud); SSL went `VALID`; updated `REPLIT_DOMAINS` → `shuttleiq.ai,…` + redeploy. Verified: 200, health ok, bookings 859, Ziina/email URLs now use shuttleiq.ai.
- **Diagnosed admin-login "Failed to fetch"** → stale pre-v4 service worker (server healthy; CORS fine; same-origin). Fix = hard-reload / unregister SW.
- **PWA installability audit** → fully installable; no-prompt is intentional intercept + desktop-only bar.
- **Granted marketplace super_admin** to `akhilasenv@gmail.com`.
- Earlier (pre-compaction): TestMale1 guest booking manual rescue; refund/cancel-event features; Google deep-link OAuth; Capacitor Android scaffold; promo removal (PR3).

---

## 13. Pending / manual action items

1. **Google Cloud Console** (OAuth client `253093700547-…`): add **JS origin** `https://shuttleiq.ai` and **redirect URI** `https://shuttleiq.ai/api/marketplace/auth/google/callback` — else marketplace Google login breaks.
2. **Ziina dashboard:** enable **Refund** permission on the API token before firing real refunds (test on sandbox first).
3. **shuttleiq.org / shuttleiqdubai.com:** still on Replit. To move to Railway they need Cloudflare (or another ALIAS-capable DNS) for apex flattening — Replit/name.com can't. The 301 redirect to shuttleiq.ai is already deployed and will activate when they point at Railway.
4. **Capacitor native QA:** verify Ziina accepts custom-scheme return URLs on-device; Android Studio Gradle build.
5. **Stale service workers:** affected users may need a hard-reload to pick up `sw.js` v4.

---

## 14. Gotchas & important notes

- **`baseUrl` everywhere = `REPLIT_DOMAINS.split(',')[0]`** — keep `shuttleiq.ai` first or Ziina/email/OAuth URLs revert.
- **Web client uses relative API URLs** (`VITE_API_BASE` unset) → admin/marketplace API is same-origin; CORS only matters for the native shell.
- **`db:push` is intentionally avoided** — schema changes go through manual guarded `ALTER`/scripts.
- **Two Neon endpoints existed** — only `ep-morning-grass-aqycj441` is live; `ep-green-river` is stale.
- **Railway apex needs Cloudflare** — no static IP, CNAME-only.
- **Custom-domain cap = 2/service** on current plan.
- **Role changes need re-login** (JWT-embedded role).
- **Railway CLI token** at `~/.railway/config.json` (`.user.token`) powers GraphQL API calls when the CLI lacks a subcommand (e.g., domain removal).
