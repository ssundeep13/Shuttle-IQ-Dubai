# ShuttleIQ - Badminton Queue Management System

### Overview
ShuttleIQ is a session-based badminton court and player queue management dashboard designed for sports facilities. Its primary purpose is to efficiently manage multiple badminton sessions across different venues, track player queues, monitor game progress, and maintain player statistics. The system focuses on providing a clear, utility-focused interface for managing active sports sessions, supporting efficient decision-making for operators. Key capabilities include session setup, player rotation, game timing, winner selection, and comprehensive statistical tracking (games played, wins, skill scores). The system enforces a 2v2 format per court and uses a modern tech stack with React, Express, and PostgreSQL.

### User Preferences
Preferred communication style: Simple, everyday language.

### System Architecture

#### UI/UX Decisions
- **Design System**: Material Design principles adapted for sports facilities, using a custom color palette (Deep Ocean Blue, Teal, Sky Blue accent) and status-based color coding.
- **Component Library**: `shadcn/ui` (New York style) built on Radix UI, styled with Tailwind CSS and Class Variance Authority (CVA).
- **Mobile Optimization**: Touch-friendly targets, responsive scaling, optimized layouts, compact spacing, shortened labels, and proper text handling for various screen sizes.

#### Technical Implementations
- **Frontend**:
    - **Framework**: React 18 with TypeScript, Vite for building, Wouter for routing.
    - **Server State Management**: TanStack Query for data fetching, caching, and synchronization.
    - **Form Handling**: React Hook Form with Zod for validation.
    - **Session Management**: A custom `useActiveSession` hook manages session state, treating a 404 response for no active session as a valid state rather than an error. The UI is gated by session status, displaying a `SessionSetupWizard` when no session is active.
- **Backend**:
    - **Framework**: Express.js with TypeScript.
    - **API Design**: RESTful endpoints for players, courts, queue, and stats, using JSON format.
    - **Authentication**: JWT-based for admin roles (`admin`, `super_admin`) with access and refresh tokens. Public routes for GET requests, protected for POST/PATCH/DELETE.
    - **Storage**: Drizzle ORM for PostgreSQL, with an in-memory storage fallback for development.
    - **Data Models**: Players (with skill levels and dynamic skill scores), Courts, Game Results, Game Participants, Queue, Notifications, and Sessions.
    - **Session Lifecycle**: Supports creating, managing, and ending sessions. Only one active session is enforced at a time, with automatic court creation upon session start. Session data is scoped to the active session.

#### Feature Specifications
- **Player Management**: Tracks player profiles (gender, skill levels, statistics). Uses a simplified 5-tier skill system (Novice, Beginner, Intermediate, Advanced, Professional) with a 10-200 point scale. Skill scores are dynamic and updated after each game using an ELO-style rating system. Players can be imported before or after session creation.
  - **Skill Tier Ranges**: Novice (10-39), Beginner (40-69), Intermediate (70-109), Advanced (110-159), Professional (160-200)
  - **Default Score**: 90 (mid-Intermediate)
  - **Display Format**: All player displays show "Gender Tier (Score)" format (e.g., "M Intermediate (85)")
  - **Rating Adjustments**: Skill scores adjust by +2 to +15 points for wins (more points for beating higher-skilled opponents), with inverse adjustments for losses
  - **Import Flexibility**: Accepts numeric skill scores OR legacy text-based skill levels with automatic tier assignment
- **Court Management**: Manages court status, game timing, and records game outcomes. Each court accommodates exactly 4 players (2v2).
- **Queue Management**: An ordered player queue with dynamic sorting capabilities (by skill level or games played today). Players are automatically added to the queue during import or session creation.
- **Intelligent Matchmaking**: AI-powered team assignment system with features for equal team skill balance, multiple shuffle options, player rest tracking, and optimization for competitive balance.
- **Session Management**: Comprehensive session lifecycle from creation to termination, including automatic court provisioning and CSV export. Players are added to a session's queue only when explicitly imported for that session, ensuring multi-session player isolation. Sessions are created with a 'draft' status and promoted to 'active' upon wizard completion.
- **Data Import/Export**:
    - **Flexible Import Workflow**: Players can be imported BEFORE or AFTER session creation via CSV or copy-paste (tab-separated or comma-separated). Smart header detection and auto-validation are included.
    - **CSV Export**: Export game history and player data.
    - **Duplicate Detection**: ShuttleIQ Unique ID prevents duplicate player entries; idempotent queue operations.
- **Game History**: Session-specific game history with complete isolation between sessions. Each session maintains its own game records, displayed in the History tab. The system uses query key scoping (`['/api/game-history', sessionId]`) and backend filtering to ensure games are never mixed between sessions. Cache invalidation uses `exact: false` to properly refresh all session-specific queries.
- **Leaderboards**: The system now features two separate leaderboards:
    - **Admin Leaderboard**: All-time global statistics for all players. Located in admin dashboard (`/admin`) with Reset Stats and Clear All Players buttons. Requires authentication.
    - **Session Leaderboard**: Session-specific statistics showing only players who participated in the current session. Located as a tab on the session dashboard (`/session/:id`). Read-only view for operators, publicly accessible. Displays games played and wins within the current session only.

#### System Design Choices
- **Storage Strategy**: Drizzle ORM for type-safe PostgreSQL interactions and an `IStorage` interface for interchangeable storage implementations.
- **Single Active Session Model**: Simplifies user experience and prevents data conflicts.
- **Query Guards**: `enabled: hasSession` guards on all session-dependent queries prevent premature API calls.
- **Modular Architecture**: Utilizes pattern-based development with clear separation of concerns.

### Recent Changes (Nov 2025)

#### Skill Management System Overhaul
Implemented a comprehensive skill management system with the following improvements:
1. **Simplified Tier System**: Reduced from 10 tiers to 5 clear tiers with well-defined numeric ranges on a 10-200 point scale
2. **Auto-Tier Correlation**: Created `skillUtils.ts` with functions for automatic tier assignment based on numeric scores
3. **ELO-Style Rating Adjustments**: Implemented dynamic skill score updates after each game based on opponent strength, win/loss, and point differential
4. **Unified Display Format**: All components (Leaderboard, SessionLeaderboard, PlayerQueue, CourtCard) now display "Tier (Score)" format
5. **Backward Compatibility**: Import logic handles both numeric scores and legacy text-based skill levels
6. **Query Cache Fix**: Fixed SessionSetupWizard query invalidation to ensure player queue displays correctly after import

**Technical Details**:
- Added `shared/utils/skillUtils.ts` with helper functions: `getSkillTier()`, `formatSkillLevel()`, `calculateSkillAdjustment()`, etc.
- Updated all default fallback values to 90 (mid-Intermediate) for consistency
- Modified import validation to accept 5-tier system while maintaining legacy data support
- Ensured all skill scores display on 10-200 scale (not SKID 0-10 values)

### External Dependencies

#### UI & Styling
- **Radix UI**: Headless UI primitives.
- **Tailwind CSS**: Utility-first styling.
- **Lucide React**: Icon components.
- **date-fns**: Date/time formatting.

#### Data & State
- **TanStack Query**: Server state management.
- **React Hook Form**: Form handling.
- **Zod**: Runtime type validation and schema inference.

#### Database
- **Neon Database Serverless**: PostgreSQL database client.
- **Drizzle ORM**: Type-safe database operations.
- **Drizzle Kit**: Database migration and schema management.

#### Development Tools
- **TypeScript**: For type-safe development.
- **Vite**: Frontend build tool.
- **ESBuild**: Production server bundling.
- **tsx**: TypeScript execution in development.

#### Session & Utilities
- **connect-pg-simple**: PostgreSQL session store.
- **clsx** and **tailwind-merge**: Utility for conditional className management.
- **cmdk**: Command palette component.
- **embla-carousel-react**: Carousel/slider functionality.
- **nanoid**: Unique ID generation.