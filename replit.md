# ShuttleIQ - Badminton Queue Management System

## Overview
ShuttleIQ is a session-based badminton court and player queue management dashboard designed for sports facilities. Its primary purpose is to efficiently manage multiple badminton sessions across different venues, track player queues, monitor game progress, and maintain player statistics. The system focuses on providing a clear, utility-focused interface for managing active sports sessions, supporting efficient decision-making for operators. Key capabilities include session setup, player rotation, game timing, winner selection, and comprehensive statistical tracking (games played, wins, skill scores). The system enforces a 2v2 format per court and uses a modern tech stack with React, Express, and PostgreSQL.

## User Preferences
Preferred communication style: Simple, everyday language.

## Authentication System

### Admin Authentication
- **Two-tier Roles**: `admin` and `super_admin` roles defined, both treated equivalently for now
- **JWT-based Auth**: Access tokens (15min expiry), refresh tokens (7 days expiry)
- **Route Protection Strategy**:
  - **Public Routes**: All GET endpoints (dashboard viewing for operators)
  - **Protected Routes**: All POST/PATCH/DELETE endpoints require admin authentication
- **Default Credentials** (development only):
  - Email: admin@shuttleiq.com
  - Password: admin123

### Security Implementation
- **Password Hashing**: bcrypt with salt rounds = 10
- **Refresh Token Storage**: Hashed using bcrypt before database storage
- **Token Cleanup**: Automatic deletion of expired sessions using `lt()` comparison
- **Seed Script**: Development-only, credentials not logged in production

### Frontend Auth Flow
- **AuthProvider**: React Context managing authentication state
- **Token Management**: Automatic refresh every 14 minutes (before 15min expiry)
- **Protected Routes**: `/admin` requires authentication, redirects to `/login` if not authenticated
- **Public Dashboard**: `/` remains accessible without authentication for operator viewing
- **Session Creation**: Requires admin authentication - public dashboard shows login prompt when no session exists and user is not authenticated

### Production Improvements Needed
⚠️ **Security Notes for Production Deployment**:
1. **httpOnly Cookies**: Move refresh tokens from localStorage to httpOnly secure cookies to prevent XSS attacks
2. **Dynamic Token Refresh**: Replace fixed 14-minute interval with JWT expiry-based scheduling
3. **API Request Helper**: Replace global fetch interception with dedicated API helper or TanStack Query wrapper
4. **Environment Variables**: Require `JWT_SECRET` and `JWT_REFRESH_SECRET` environment variables (fail startup if missing)
5. **CORS Configuration**: Configure proper CORS headers for production domains

## System Architecture

### UI/UX Decisions
- **Design System**: Material Design principles adapted for sports facilities, using a custom color palette (Deep Ocean Blue, Teal, Sky Blue accent) and status-based color coding.
- **Component Library**: `shadcn/ui` (New York style) built on Radix UI, styled with Tailwind CSS and Class Variance Authority (CVA).
- **Mobile Optimization**: Touch-friendly targets (min-h-12), responsive scaling, optimized layouts (vertical stacking on mobile, horizontal on desktop), compact spacing, shortened labels, and proper text handling for various screen sizes.

### Technical Implementations
- **Frontend**:
    - **Framework**: React 18 with TypeScript.
    - **Build Tool**: Vite.
    - **Routing**: Wouter.
    - **Server State Management**: TanStack Query for data fetching, caching, and synchronization.
    - **Form Handling**: React Hook Form with Zod for validation.
    - **Session Management**: A custom `useActiveSession` hook manages session state, treating a 404 response for no active session as a valid state rather than an error. The UI is gated by session status, displaying a `SessionSetupWizard` when no session is active.
- **Backend**:
    - **Framework**: Express.js with TypeScript.
    - **API Design**: RESTful endpoints for players, courts, queue, and stats, using JSON format.
    - **Storage**: Drizzle ORM for PostgreSQL, with an in-memory storage fallback for development.
    - **Data Models**: Players (with detailed skill levels and skill scores), Courts, Game Results, Game Participants, Queue, Notifications, and Sessions.
    - **Session Lifecycle**: Supports creating, managing, and ending sessions. Only one active session is enforced at a time, with automatic court creation upon session start. Session data is scoped to the active session.

### Feature Specifications
- **Player Management**: Tracks player profiles including gender, skill levels (Novice to Professional with +/- variants), and statistics. Skill scores (10-200 points) are dynamic based on gender and level. **Players can be imported before session creation** - they will be automatically added to the queue when a session is created.
- **Court Management**: Manages court status, game timing, and records game outcomes. Each court accommodates exactly 4 players (2v2).
- **Queue Management**: An ordered player queue with dynamic sorting capabilities (by skill level or games played today). Players are automatically added to the queue either during import (if session exists) or during session creation (if imported before session).
- **Intelligent Matchmaking**: AI-powered team assignment system with four key improvements:
  - **Equal Team Skill Balance**: Evaluates all three possible 2v2 team permutations to minimize skill gaps between teams
  - **Multiple Shuffle Options**: Provides 3 pre-computed balanced team combinations for operators to choose from
  - **Player Rest Tracking**: Prevents player fatigue by tracking consecutive games (2+ games triggers rest warnings)
  - **Closely Matched Games**: Optimizes for competitive balance through skill-gap minimization scoring algorithm
  - **Implementation**: Backend matchmaking service (`server/matchmaking.ts`) maintains per-session rest states, frontend displays skill averages, team balance indicators, rest warnings, and allows cycling through combinations
- **Session Management**: Comprehensive session lifecycle from creation to termination, including automatic court provisioning and a mechanism for exporting game history as CSV. When a session is created, all existing players in the database are automatically added to the session's queue.
- **Data Import/Export**: 
  - **Flexible Import Workflow**: Players can be imported BEFORE or AFTER session creation
    - If imported before session: Players are stored and automatically added to queue when session is created
    - If imported after session: Players are immediately added to the active session's queue
  - **CSV Import**: Supports CSV import of players with ShuttleIQ Unique ID tracking (format: ShuttleIQ Unique ID, Name, Gender, Level)
  - **Copy-Paste Import**: Quick player import via textarea supporting both tab-separated (Excel) and comma-separated (CSV) formats
    - Smart header detection (auto-adds headers if missing, preserves user headers if provided)
    - Proper CSV field escaping for commas, quotes, and newlines
    - Available in both Session Setup Wizard and Admin Dashboard
    - Automatic data validation and duplicate detection
    - Mobile-optimized responsive design
  - **CSV Export**: Export game history and player data as CSV files
  - **Duplicate Detection**: ShuttleIQ Unique ID prevents duplicate player entries across sessions; idempotent queue operations prevent duplicate queue entries

### System Design Choices
- **Storage Strategy**: Drizzle ORM for type-safe PostgreSQL interactions and an `IStorage` interface for interchangeable storage implementations (in-memory or database).
- **Single Active Session Model**: Simplifies user experience and prevents data conflicts, ideal for a single-operator use case.
- **Query Guards**: `enabled: hasSession` guards on all session-dependent queries prevent premature API calls and errors.
- **Modular Architecture**: Utilizes pattern-based development with clear separation of concerns (frontend, backend, storage, services).

## External Dependencies

### UI & Styling
- **Radix UI**: Headless UI primitives.
- **Tailwind CSS**: Utility-first styling.
- **Lucide React**: Icon components.
- **date-fns**: Date/time formatting.

### Data & State
- **TanStack Query**: Server state management.
- **React Hook Form**: Form handling.
- **Zod**: Runtime type validation and schema inference.

### Database
- **Neon Database Serverless**: PostgreSQL database client.
- **Drizzle ORM**: Type-safe database operations.
- **Drizzle Kit**: Database migration and schema management.

### Development Tools
- **TypeScript**: For type-safe development.
- **Vite**: Frontend build tool.
- **ESBuild**: Production server bundling.
- **tsx**: TypeScript execution in development.

### Session & Utilities
- **connect-pg-simple**: PostgreSQL session store.
- **clsx** and **tailwind-merge**: Utility for conditional className management.
- **cmdk**: Command palette component.
- **embla-carousel-react**: Carousel/slider functionality.
- **nanoid**: Unique ID generation.

## Recent Changes

### Multi-Session Player Isolation Implementation (November 14, 2025)
**Status**: ✅ Complete and Production-Ready

**Problem Solved**: 
- Players were incorrectly auto-added to ALL sessions, violating session isolation
- Wizard state persisted across multiple uses, causing stale sessionId bugs
- Players imported to one session appeared in all other sessions

**Solution Implemented**:

**1. Removed Auto-Add-All Logic**
- Sessions no longer automatically add all existing players on creation
- Each session starts with an empty queue
- Players are added ONLY when explicitly imported to that session

**2. Session-Scoped Player Imports**
- Player import API now accepts optional `sessionId` parameter
- Validates session exists before adding players
- Players added exclusively to target session's queue
- Falls back to active session for backward compatibility

**3. Draft Session Lifecycle**
- Wizard creates session with `status='draft'` immediately after Step 1
- Stores `createdSessionId` for subsequent import operations
- Promotes session to `status='active'` on wizard completion
- Abandoned drafts remain in database but hidden from UI

**4. Robust State Management**
- Wizard state resets via `useEffect` on component mount
- React `key` prop incremented on every wizard close (completion OR cancellation)
- Forces fresh component remount, preventing stale state reuse
- Defensive checks ensure `createdSessionId` exists before imports

**5. Draft Session Filtering**
- Sessions Management page filters out `status='draft'` sessions
- Only active, upcoming, and ended sessions displayed to users
- Draft cleanup can be added later via background job

### Technical Implementation Details

**Backend Changes**:
- `POST /api/players/import`: Accepts `sessionId` parameter, validates session, adds to queue
- `PATCH /api/sessions/:id`: Updates session fields (requires admin auth)
- `storage.updateSession(id, updates)`: Generic update method in IStorage interface
- Removed automatic player addition from `createSession` method

**Frontend Changes**:
- **SessionSetupWizard.tsx**:
  - Creates draft session after Step 1, stores `createdSessionId`
  - CSV file import passes `sessionId` to API
  - Copy-paste import passes `sessionId` to API
  - Defensive checks before imports (error if sessionId missing)
  - Promotes session via PATCH on "Finish Setup"
  - `useEffect` resets all state on mount

- **SessionsManagement.tsx**:
  - Added `wizardKey` state, increments on every wizard close
  - `useEffect` watches `showCreateSession`, increments key when false
  - Filters draft sessions: `sessions.filter(s => s.status !== 'draft')`
  - Passes `key={wizardKey}` to wizard, forcing remount

### Complete User Workflow
```
1. Admin clicks "New Session" → Wizard opens (fresh state, key changes)
2. Step 1: Fill session details → Creates draft session → Stores sessionId
3. Step 2: (Optional) Import players → Pass sessionId → Add to THIS session only
4. Click "Finish" → Promote to 'active' → Reset state → Close wizard
5. Next "New Session" click → Key increments → Fresh wizard mount

Cancel Flow:
1. Admin clicks "New Session" → Wizard opens
2. Fill details → Create draft session
3. Click outside → Close wizard → Key increments
4. Next "New Session" click → Fresh state (no stale sessionId)
```

### Testing & Validation
**End-to-End Test Results**: ✅ PASSED
- ✅ Multi-session player isolation (Session A players ≠ Session B players)
- ✅ Wizard state reset on completion (fresh state on reopen)
- ✅ Wizard state reset on cancellation (no stale data)
- ✅ Draft session lifecycle (create → promote → filter)
- ✅ Sequential session creation without state pollution
- ✅ Defensive checks prevent import errors

**Test Coverage**:
- Login authentication ✅
- Session A creation with 3 players ✅
- Session B creation with 4 different players ✅
- Wizard cancel/remount verification ✅
- Draft filtering verification ✅

**Remaining Work** (Next Feature):
- Build per-session dashboard to visually display session-specific queues
- Add court management, game controls, and queue operations per session