# ShuttleIQ - Badminton Queue Management System

### Overview
ShuttleIQ is a session-based badminton court and player queue management dashboard designed for sports facilities. Its primary purpose is to efficiently manage multiple badminton sessions across different venues, track player queues, monitor game progress, and maintain player statistics. The system focuses on providing a clear, utility-focused interface for managing active sports sessions, supporting efficient decision-making for operators. Key capabilities include session setup, player rotation, game timing, winner selection, and comprehensive statistical tracking (games played, wins, skill scores). The system enforces a 2v2 format per court and uses a modern tech stack with React, Express, and PostgreSQL. The project's ambition is to streamline sports facility operations, enhance player engagement through transparent statistics, and offer an intuitive management experience, ultimately growing into a comprehensive sports facility management solution.

### User Preferences
Preferred communication style: Simple, everyday language.

### System Architecture

#### UI/UX Decisions
- **Design System**: Material Design principles with a custom color palette (Deep Ocean Blue, Teal, Sky Blue accent) and status-based color coding.
- **Component Library**: `shadcn/ui` (New York style) built on Radix UI, styled with Tailwind CSS and Class Variance Authority (CVA).
- **Mobile Optimization**: Touch-friendly, responsive layouts optimized for various screen sizes.

#### Technical Implementations
- **Frontend**: React 18 with TypeScript, Vite, Wouter for routing. TanStack Query for server state management, React Hook Form with Zod for validation.
- **Backend**: Express.js with TypeScript, RESTful API design. JWT-based authentication for admin and marketplace roles. Drizzle ORM for PostgreSQL storage, with an in-memory fallback for development.
- **Data Models**: Players (with dynamic ELO-style skill scores), Courts, Game Results, Queue, Sessions, Marketplace users, Bookable Sessions, Bookings, Expenses, Tags, Tag Suggestions, Tag Suggestion Votes, and Referrals.
- **Session Lifecycle**: Supports creating, managing, and ending multiple simultaneous sessions. Sessions are created with a 'draft' status and activated via a wizard.
- **Player Management**: Tracks player profiles, skill levels (5-tier system), and dynamic skill scores.
- **Queue Management**: Ordered player queue with dynamic sorting and intelligent matchmaking for competitive team assignments.
- **Data Import/Export**: CSV import for players with smart header detection and validation; CSV export for game history and player data.
- **Leaderboards**: Global admin leaderboard and session-specific leaderboards.
- **Marketplace**: Player-facing platform for session browsing and booking, including Google OAuth, Ziina payment integration, player dashboards (My Bookings, My Scores, Rankings, Profile), community tagging (Player Personalities), and community tag suggestions with voting. Marketplace users can self-service update their account email/phone from /marketplace/profile via OTP-to-new-value verification (audited in `marketplace_user_contact_changes`). Profile photos are supported: users can upload a JPEG/PNG/WebP/GIF (≤5MB) via `POST /api/marketplace/profile/photo` (multer, stored in `uploads/profile/`) or remove it via `DELETE`. Google sign-in auto-captures the Google `picture` URL on first login (and back-fills returning accounts), but never overwrites a user-uploaded photo.
- **Admin Dashboard**: Unified hub for session management, player management, marketplace user management, financial tracking (expenses, P&L), and blog content management.
- **Blog System**: Admin-managed blog with Markdown content, featured image upload (multer, stored in `uploads/blog/`), draft/published workflow, SEO meta injection. Public pages at `/marketplace/blog` and `/marketplace/blog/:slug`.
- **Referral System**: Players earn AED 15 wallet credit (1500 fils) per referred friend who attends their first session. Referral codes auto-generated in format `SIQ-{NAME6}-{numericId}`. Milestones at 5 (leaderboard mention) and 10 (ambassador status + jersey). Wallet credit can be applied to booking checkout. API routes under `/api/referrals/`. Email notifications via Resend for credit earned, milestones, and welcome with referrer context. Signup accepts optional `referralCode` field.
- **Performance**: Route-level code splitting, vendor chunk grouping, TanStack Query caching, and a health endpoint for server warming.
- **Match Suggestions (Phase 1 of player-facing gameplay flow)**: Schema tables `match_suggestions` (id, sessionId, courtId, suggestedAt, pendingUntil, status: pending|approved|playing|completed|dismissed, approvedBy) and `match_suggestion_players` (suggestionId+playerId composite PK, courtId duplicated from parent, team). `game_results.matchSuggestionId` is a nullable unique idempotency key linking a recorded game back to the suggestion that was played. The admin end-game route (`POST /api/courts/:courtId/end-game`) now wraps player updates + game_results insert + game_participants inserts in a single `db.transaction` via `storage.completeGameTransaction(...)`, with the skill compute callback re-reading player rows inside the tx so partial writes can no longer corrupt skill scores. Court reset, queue update, rest-state and partner-history bookkeeping remain outside the tx (unchanged behavior). When the unique-index claim loses (concurrent duplicate end-game), the route short-circuits on `txResult.alreadySubmitted` to skip those side effects.
- **Player self-service start (Task #47)**: Closes the self-service loop with End Game (Task #45). The "Court Ready – Head to Court X now" screen on `/marketplace/play` renders a primary "Start game" button (visible to any of the 4 lineup players). `POST /api/marketplace/games/:suggestionId/start-game` performs an atomic CAS approved→playing AND every downstream side effect (court occupied + 15-min timer + startedAt; `court_players` rewrite; per-player status='playing'; queue removal) inside a single `db.transaction` in `storage.startApprovedSuggestion`. Concurrent taps from multiple players collapse into exactly one transition: the winner returns `{alreadyStarted:false}`, race losers get `{alreadyStarted:true}` and short-circuit (no double-write). The membership probe runs against `match_suggestion_players` BEFORE any suggestion existence lookup, so unknown suggestionIds and known-but-not-yours suggestionIds collapse to the same 404 — no enumeration leak. Admin Court Management's manual Start Game flow is unchanged. End-to-end coverage in `scripts/test-e2e-self-service-loop.mjs` (12 steps, idempotency on both start and submit-score, anti-enumeration check).
- **Queued (next-round) suggestions (Task #54)**: A second pass in `tryAutoMatchmaking` (in `server/auto-matchmaking.ts`) builds `status='queued'` rows for any court currently `playing` that doesn't already have a queued lineup, drawing from the pure waiting pool (Case 1 only — Case 2/3 active-player mixing is deferred). When 2+ courts need queued lineups simultaneously, a single batched call to `requestPlayerFlowMatchmaking` (Claude sonnet-4-5, 5s, 2000 tokens) produces both — otherwise the standard bracket generator runs per-court. On game end, BOTH the player-driven submit-score path (`server/marketplace-routes.ts`) and the admin end-game route (`server/routes.ts`) call `tryFlipQueuedToPendingForCourt(sessionId, courtId)` BEFORE firing `tryAutoMatchmaking`. The helper checks that all 4 named players are still in the queue, not sitting out, and not on any other open suggestion (with the queued row itself excluded from the "other" filter); if eligible, it CAS-flips queued→pending with a fresh 90s `pendingUntil`; otherwise it dismisses the queued row so the auto-matchmaker reassigns the court from scratch. The Court Captain panel (`PendingLineupsPanel.tsx`) renders queued rows in a separate non-actionable "Up next (auto-confirms when current game ends)" group, and `/marketplace/play` renders an "On deck" card variant (no Start Game button) when the player's current suggestion has `status='queued'`. New endpoints: `POST /api/marketplace/players/me/done` (race-safe CAS dismiss of pending|approved|queued rows the player is named on, removes them from queue, fires re-matchmaking — never touches `playing` rows) and `GET /api/marketplace/players/me/today-stats` (gamesToday / waitingNow / courtsBusy chips for the WaitingScreen header). Stale-row defenses also shipped: `getCurrentSuggestionForPlayer` and the two route fallbacks in `marketplace-routes.ts` now inner-join `sessions` and filter `status='active'`; `endSession` sweeps any pending|approved|playing|queued rows to `dismissed` and frees the court before flipping the session to ended.

- **Admin → player sync (Task #43)**: The legacy admin court system (`courts`, `court_players`) and the marketplace player system (`match_suggestions`) used to be split-brain — admin Start/Cancel/End never reached player phones. The admin write paths now mirror into match_suggestions: `assignCourtCore` calls `storage.replaceActiveSuggestionForAdminAssignment(...)` (atomically dismisses any conflicting pending|approved|playing rows for the court or any of the 4 players, then inserts a fresh `playing` row with `approvedBy='admin'`); cancel-game looks up the active suggestion for the court and dismisses it; end-game passes the active suggestion id into `completeGameTransaction` which marks it `completed` atomically. All admin-side mirroring is wrapped in try/catch so a sync failure never breaks the legacy admin action. The player-facing `/api/marketplace/players/me/current-suggestion` endpoint adds a recently-dismissed fallback (filtered via `pendingUntil > now()` — admin dismiss paths bump `pendingUntil` to now+10min so the recency check works regardless of how long the original game ran) so PlayingScreen can detect cancel-game and route back to the waiting screen instead of incorrectly proceeding to score entry. The score-entry path (`?for=score-entry`) intentionally skips the dismissed fallback so a cancelled separate assignment can never block a player from scoring a game they actually finished.

#### System Design Choices
- **Storage Strategy**: Drizzle ORM with an `IStorage` interface for interchangeable storage implementations.
- **Modular Architecture**: Pattern-based development with clear separation of concerns.
- **Query Guards**: `enabled` option for TanStack Query to prevent premature API calls.

### External Dependencies

#### UI & Styling
- **Radix UI**: Headless UI primitives.
- **Tailwind CSS**: Utility-first styling.
- **Lucide React**: Icon components.
- **date-fns**: Date/time formatting.
- **cmdk**: Command palette component.
- **embla-carousel-react**: Carousel/slider functionality.

#### Data & State
- **TanStack Query**: Server state management.
- **React Hook Form**: Form handling.
- **Zod**: Runtime type validation and schema inference.

#### Database
- **Neon Database Serverless**: PostgreSQL database client.
- **Drizzle ORM**: Type-safe database operations.
- **Drizzle Kit**: Database migration and schema management.
- **connect-pg-simple**: PostgreSQL session store.

**Single shared database for development and production.** This fork is a test bed with no real end-users. Both `npm run dev` (workspace) and the deployed app connect to the **same** PostgreSQL instance — the Neon database originally auto-provisioned for the deployment. This was set up by manually overriding the workspace's `DATABASE_URL` secret to match the deployment's connection string. As a result, every booking, check-in, schema push, and admin action is visible in exactly one place; there is no dev-vs-prod data drift to reason about. The previously auto-provisioned workspace database has since been deleted via the database panel — there is now exactly one database.

**Caveat:** schema changes pushed from the workspace (`npm run db:push`) hit the live app immediately. There is no "test in dev first" buffer. If real end-users ever start using this app, re-introduce dev/prod isolation by provisioning a fresh workspace database (the database panel will let Replit auto-provision a new one), pointing `DATABASE_URL` at it, and restarting the workflow.

**Diagnostic note for agents:** the built-in SQL tool's `environment="development"` mode is no longer meaningful for this project — there is no separate dev DB to query. To verify what the app actually reads/writes, use `environment="production"` (which targets the shared DB the app uses), or run a script via Node/tsx that opens its own pool from `process.env.DATABASE_URL`.

#### Development Tools
- **TypeScript**: For type-safe development.
- **Vite**: Frontend build tool.
- **ESBuild**: Production server bundling.
- **tsx**: TypeScript execution in development.
- **Vitest**: Component test runner (jsdom env, `@testing-library/react`). Run with `npm test` (one-shot) or `npm run test:watch`. Suite lives in `tests/*.test.tsx` with shared setup in `tests/setup.ts`. Registered as the `test` validation command — run before merging to catch checkout regressions (e.g. `tests/checkout-success-signin-notice.test.tsx` covers the post-payment sign-in notice and happy-path auto-redirect).

#### Payments
- **Ziina**: Payment processing (UAE-focused, redirect-based hosted checkout).

#### Email
- **Resend**: Transactional email service (welcome, booking confirmations, reminders, password resets).

#### Utilities
- **nanoid**: Unique ID generation.
- **clsx** and **tailwind-merge**: Utilities for conditional className management.