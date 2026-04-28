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
- **Match Suggestions (Phase 1 of player-facing gameplay flow)**: Schema tables `match_suggestions` (id, sessionId, courtId, suggestedAt, pendingUntil, status: pending|approved|playing|completed, approvedBy) and `match_suggestion_players` (suggestionId+playerId composite PK, courtId duplicated from parent, team). `game_results.matchSuggestionId` is a nullable unique idempotency key linking a recorded game back to the suggestion that was played. The admin end-game route (`POST /api/courts/:courtId/end-game`) now wraps player updates + game_results insert + game_participants inserts in a single `db.transaction` via `storage.completeGameTransaction(...)`, with the skill compute callback re-reading player rows inside the tx so partial writes can no longer corrupt skill scores. Court reset, queue update, rest-state and partner-history bookkeeping remain outside the tx (unchanged behavior).

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

**Single shared database for development and production.** This fork is a test bed with no real end-users. Both `npm run dev` (workspace) and the deployed app connect to the **same** PostgreSQL instance — the Neon database originally auto-provisioned for the deployment. This was set up by manually overriding the workspace's `DATABASE_URL` secret to match the deployment's connection string. As a result, every booking, check-in, schema push, and admin action is visible in exactly one place; there is no dev-vs-prod data drift to reason about. Replit's auto-provisioned workspace database still physically exists but is **dormant**: nothing reads from or writes to it. It can be deleted via the database panel later if desired (kept around for now as a safety net).

**Caveat:** schema changes pushed from the workspace (`npm run db:push`) hit the live app immediately. There is no "test in dev first" buffer. If real end-users ever start using this app, re-introduce dev/prod isolation by removing the manual `DATABASE_URL` override from the workspace Secrets pane and restarting the workflow — the workspace will fall back to its dormant auto-provisioned DB.

**Diagnostic note for agents:** the built-in SQL tool's `environment="development"` mode queries the auto-provisioned (dormant) workspace DB directly, **not** what the running app sees. To verify what the app actually reads/writes, either (a) use `environment="production"` (which targets the same shared DB the app uses), or (b) run a script via Node/tsx that opens its own pool from `process.env.DATABASE_URL`.

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