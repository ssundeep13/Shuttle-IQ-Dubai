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
- **Player Management**: Tracks player profiles including gender, skill levels (Novice to Professional with +/- variants), and statistics. Skill scores (10-200 points) are dynamic based on gender and level.
- **Court Management**: Manages court status, game timing, and records game outcomes. Each court accommodates exactly 4 players (2v2).
- **Queue Management**: An ordered player queue with dynamic sorting capabilities (by skill level or games played today).
- **Session Management**: Comprehensive session lifecycle from creation to termination, including automatic court provisioning and a mechanism for exporting game history as CSV.
- **Data Import/Export**: Supports CSV import of players (with duplicate detection and error handling) and CSV export of game history.

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