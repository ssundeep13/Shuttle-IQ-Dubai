# ShuttleIQ - Badminton Queue Management System

## Overview

ShuttleIQ is a real-time badminton court and player queue management dashboard designed for sports facilities. The application enables operators to efficiently manage multiple badminton courts, track player queues, monitor game progress, and maintain player statistics. Built with a focus on information clarity and quick decision-making, it provides a professional, utility-focused interface for managing active sports sessions.

The system handles court assignments, player rotations, game timing, winner selection, and maintains comprehensive statistics including games played, wins, win rates, and dynamic skill scores (0-10 scale). Each court accommodates exactly 4 players in a 2v2 format. The system uses a modern tech stack with React for the frontend, Express for the backend, and PostgreSQL database for persistent storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- **React 18** with TypeScript for component-based UI development
- **Vite** as the build tool and development server, configured with custom plugins for Replit integration
- **Wouter** for lightweight client-side routing (replaces React Router)
- **TanStack Query (React Query)** for server state management, data fetching, caching, and synchronization

**UI Component System:**
- **shadcn/ui** component library (New York style variant) built on Radix UI primitives
- **Tailwind CSS** for utility-first styling with custom design tokens
- **Class Variance Authority (CVA)** for component variant management
- Custom CSS variables system for theme management (light/dark mode support)

**Design System:**
- Material Design principles adapted for sports facility management
- Custom color palette: Deep Ocean Blue primary (#003d6b), Teal secondary (#00a19c), Sky Blue accent (#38BDF8)
- Status-based color coding for courts and players (success/green, warning/amber, danger/red, info/blue)
- Responsive design with mobile-first breakpoints

**Mobile Optimization:**
- **Touch-Friendly Targets**: All interactive elements (buttons, inputs, selects, tiles) use min-h-12 (48px) on mobile, exceeding WCAG 44px minimum
- **Responsive Scaling**: Mobile-first approach with sm: breakpoint reducing sizes on larger screens (e.g., min-h-12 sm:min-h-10)
- **Optimized Layouts**: Components stack vertically on mobile, expand horizontally on larger screens
- **Compact Spacing**: Reduced padding on mobile (p-3 sm:p-4, p-4 sm:p-6) for efficient space usage
- **Shortened Labels**: Button labels adapt to screen size ("Add" on mobile, "Add Player" on desktop)
- **CourtCard**: min-h-[400px] on mobile, min-h-[500px] on larger screens for better information density
- **Text Handling**: Proper truncation and wrapping to prevent overflow on narrow screens
- **Modal Dialogs**: All dialog buttons, inputs, and selects meet 48px touch target requirement

**State Management:**
- Local component state for UI interactions (selected players, active tabs, modal visibility)
- TanStack Query for server-state caching and automatic refetching
- Custom notification queue system for real-time user feedback

**Form Handling:**
- **React Hook Form** with Zod schema validation
- Integration with shadcn/ui form components
- Type-safe form validation using schema definitions from shared types

### Backend Architecture

**Server Framework:**
- **Express.js** with TypeScript for RESTful API endpoints
- Custom middleware for request logging and error handling
- Development/production environment configuration

**API Design:**
- RESTful endpoints for players (`/api/players`), courts (`/api/courts`), queue (`/api/queue`), and stats (`/api/stats`)
- CRUD operations with proper HTTP method conventions
- JSON request/response format with error handling

**Storage Strategy:**
- **Drizzle ORM** configured for PostgreSQL database operations
- **In-memory storage implementation** (MemStorage class) as fallback/development option
- Storage interface pattern (IStorage) allowing interchangeable implementations
- Database schema defined using Drizzle's schema builder

**Data Models:**
- **Players**: id, name, gender (Male/Female), level, gamesPlayed, wins, skillScore (10-200 point scale), status (waiting/playing)
  - **Skill Levels**: Novice, Beginner-, Beginner, Beginner+, Intermediate-, Intermediate, Intermediate+, Advanced, Advanced+, Professional
  - **Skill ID (SKID)**: Each gender/level combination has a unique SKID (1-20) with corresponding skill points:
    - Female levels: 10, 30, 50, 70, 90, 110, 130, 150, 170, 190
    - Male levels: 20, 40, 60, 80, 100, 120, 140, 160, 180, 200
  - **Display Format**: Gender prefix + level (e.g., "M Beginner+", "F Advanced")
- **Courts**: id, name, status (available/occupied), timeRemaining, winningTeam, startedAt (timestamp when game started)
- **Court-Players** relationship: Each court MUST have exactly 4 players (2 per team)
- **Game Results**: id, courtId, team1Score, team2Score, winningTeam, createdAt (completion timestamp)
- **Game Participants**: gameId, playerId, team, skillScoreBefore, skillScoreAfter
- **Queue**: Ordered list of player IDs with position tracking and dynamic sorting capabilities
  - **Default Sort**: By skill level (Advanced/Professional → Intermediate → Beginner/Novice)
  - **Alternative Sort**: By games played TODAY (most games first for daily sessions)
  - **UI Control**: Dropdown selector for switching between sort methods
- **Today's Stats**: Separate endpoint (`/api/stats/today`) filters games by date (today's midnight onwards) and calculates daily metrics (gamesPlayedToday, winsToday)
- **Notifications**: Type-based messaging system (success/warning/danger/info)

### Database Schema

**PostgreSQL with Drizzle ORM:**
- `players` table: Player profiles with gender (Male/Female), granular skill levels (Novice through Professional with +/- variants), statistics (games played, wins), and skill scores (10-200 point scale based on gender + level combination)
- `courts` table: Court state including availability, game timing, and startedAt timestamp for active games
- `court_players` junction table: Manages which players are assigned to which courts (exactly 2 players per team required)
- `game_results` table: Records completed games with scores, winning team, and createdAt timestamps
- `game_participants` table: Tracks which players participated in each game, their team assignments, and skill score changes before/after games
- `queue_entries` table: Maintains ordered waiting queue with position tracking and timestamps

**Schema Design Principles:**
- UUID-based primary keys via varchar fields
- Integer counters for statistics (games played, wins)
- Text fields for status and level enums
- Timestamps for queue ordering and auditing
- NOT NULL constraints with sensible defaults

### External Dependencies

**UI & Styling:**
- **Radix UI** (@radix-ui/*): Headless UI primitives for accessible components (accordion, dialog, dropdown, popover, tabs, toast, etc.)
- **Tailwind CSS** with PostCSS and Autoprefixer for styling
- **Lucide React** for icon components
- **date-fns** for date/time formatting and manipulation

**Data & State:**
- **TanStack Query** (@tanstack/react-query): Server state management
- **React Hook Form** with Hookform Resolvers for form handling
- **Zod** with drizzle-zod for runtime type validation and schema inference

**Database:**
- **Neon Database Serverless** (@neondatabase/serverless): PostgreSQL database client
- **Drizzle ORM** (drizzle-orm): Type-safe database operations
- **Drizzle Kit**: Database migration and schema management tool

**Development Tools:**
- **Replit-specific plugins**: Vite runtime error modal, cartographer, dev banner
- **TypeScript** with strict mode enabled
- **ESBuild** for production server bundling
- **tsx** for TypeScript execution in development

**Session & Utilities:**
- **connect-pg-simple**: PostgreSQL session store (prepared for authentication)
- **clsx** and **tailwind-merge**: Utility for conditional className management
- **cmdk**: Command palette component
- **embla-carousel-react**: Carousel/slider functionality
- **nanoid**: Unique ID generation

**Architecture Rationale:**
- **Vite over Create React App**: Faster development builds and HMR, better TypeScript support
- **TanStack Query**: Eliminates boilerplate for data fetching, provides automatic caching and background updates
- **Drizzle ORM**: Type-safe database operations with excellent TypeScript integration, lighter than Prisma
- **shadcn/ui**: Provides copy-paste component flexibility rather than package dependency, full customization control
- **In-memory storage fallback**: Enables rapid development without database setup, easy testing
- **Storage interface pattern**: Allows switching between in-memory and database implementations without changing business logic

### Data Import/Export Features

**CSV Download (Game History):**
- Export complete game history to CSV file for record-keeping and analysis
- Format: Game #, Date, Team 1 Players, Team 2 Players, Score, Winning Team
- RFC 4180 compliant CSV generation with proper quote escaping (" → "")
- All fields quoted to handle special characters (commas, quotes) in player names
- UTF-8 with BOM for Excel compatibility
- Filename format: `game-history-YYYY-MM-DD.csv`

**CSV Upload (Player Import):**
- Import players from CSV file via Import Players modal
- Required columns: Name, Gender, Level (case-insensitive header matching)
- Supports special characters in names:
  - Commas: `"Lee, Jr.",Male,Intermediate`
  - Quotes: `"Test ""Quote"" Player",Female,Beginner`
- UTF-8 BOM automatically stripped for Excel/Google Sheets compatibility
- Robust CSV parser handles quoted fields with embedded commas and escaped quotes
- Empty rows and invalid data automatically skipped with detailed feedback
- Tab-specific state management prevents feedback confusion between import methods
- Duplicate player detection (name-based) with skip reporting