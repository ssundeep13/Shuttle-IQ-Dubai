# ShuttleIQ - Badminton Queue Management System

### Overview
ShuttleIQ is a session-based badminton court and player queue management dashboard designed for sports facilities. Its primary purpose is to efficiently manage multiple badminton sessions across different venues, track player queues, monitor game progress, and maintain player statistics. The system focuses on providing a clear, utility-focused interface for managing active sports sessions, supporting efficient decision-making for operators. Key capabilities include session setup, player rotation, game timing, winner selection, and comprehensive statistical tracking (games played, wins, skill scores). The system enforces a 2v2 format per court and uses a modern tech stack with React, Express, and PostgreSQL. The project's ambition is to streamline sports facility operations, enhance player engagement through transparent statistics, and offer an intuitive management experience.

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
    - **Authentication**: JWT-based for admin roles (`admin`, `super_admin`) with access and refresh tokens. Public routes for GET requests, protected for POST/PATCH/DELETE. Access tokens expire after 4 hours with proactive refresh.
    - **Storage**: Drizzle ORM for PostgreSQL, with an in-memory storage fallback for development.
    - **Data Models**: Players (with skill levels and dynamic skill scores), Courts, Game Results, Game Participants, Queue, Notifications, and Sessions.
    - **Session Lifecycle**: Supports creating, managing, and ending sessions. Only one active session is enforced at a time, with automatic court creation upon session start. Session data is scoped to the active session, and historical sessions are viewable in read-only mode.

#### Feature Specifications
- **Player Management**: Tracks player profiles (gender, skill levels, statistics) with unique ShuttleIQ IDs. Uses a 5-tier skill system (Novice, Beginner, Intermediate, Advanced, Professional) with a 10-200 point scale, where skill scores dynamically update after each game using an ELO-style rating system. Player profiles and an admin player registry are available.
- **Court Management**: Manages court status, game timing, and records game outcomes. Each court accommodates exactly 4 players (2v2).
- **Queue Management**: An ordered player queue with dynamic sorting capabilities (by skill level or games played today). Players are automatically added to the queue during import or session creation.
- **Intelligent Matchmaking**: AI-powered team assignment system provides lineup recommendations with features for equal team skill balance, multiple shuffle options, player rest tracking, and optimization for competitive balance.
- **Session Management**: Comprehensive session lifecycle from creation to termination, including automatic court provisioning and CSV export. Players are added to a session's queue only when explicitly imported for that session, ensuring multi-session player isolation. Sessions are created with a 'draft' status and promoted to 'active' upon wizard completion.
- **Data Import/Export**: Supports flexible player import via CSV or copy-paste with smart header detection and auto-validation. Provides CSV export of game history and player data. Duplicate player detection is handled via ShuttleIQ Unique IDs.
- **Game History**: Session-specific game history with complete isolation between sessions.
- **Leaderboards**: Includes a global admin leaderboard for all-time statistics and a session-specific leaderboard showing only players who participated in the current session.
- **ShuttleIQ Marketplace**: Player-facing booking and community platform with:
    - **Marketplace Auth**: Separate JWT-based auth for marketplace players (`marketplace_player` role), with tokens stored as `mp_accessToken`/`mp_refreshToken`. Enforced via `requireMarketplaceAuth` middleware on the server.
    - **Session Browsing & Booking**: Public session listing with venue, date, time, capacity, and pricing (AED). Authenticated users can book sessions (one active booking per session enforced).
    - **Player Dashboards**: My Bookings (with cancel), My Scores (linked player stats), Rankings (global leaderboard), Profile (account details + player linking).
    - **Player Linking**: Marketplace accounts can link to existing ShuttleIQ player profiles for score/ranking integration.
    - **Admin Marketplace**: Admin-only dashboard for managing bookable sessions, viewing bookings, marking attendance, and managing marketplace users.
    - **Routes**: All marketplace routes under `/marketplace/*`, API under `/api/marketplace/*`.
    - **DB Tables**: `marketplace_users`, `marketplace_auth_sessions`, `bookable_sessions`, `bookings`, `payments`.
    - **Frontend Route Guards**: `MarketplaceProtectedRoute` redirects unauthenticated users to `/marketplace/login`.
    - **Token Routing**: `getAuthToken()` in `queryClient.ts` detects marketplace vs admin URLs and sends the correct token. Admin fetch interceptor in `AuthContext` excludes `/api/marketplace/` URLs.

#### System Design Choices
- **Storage Strategy**: Drizzle ORM for type-safe PostgreSQL interactions and an `IStorage` interface for interchangeable storage implementations.
- **Single Active Session Model**: Simplifies user experience and prevents data conflicts, while allowing read-only access to historical sessions.
- **Query Guards**: `enabled: hasSession` guards on all session-dependent queries prevent premature API calls.
- **Modular Architecture**: Utilizes pattern-based development with clear separation of concerns.

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