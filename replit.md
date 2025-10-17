# ShuttleIQ - Badminton Queue Management System

## Overview

ShuttleIQ is a real-time badminton court and player queue management dashboard designed for sports facilities. The application enables operators to efficiently manage multiple badminton courts, track player queues, monitor game progress, and maintain player statistics. Built with a focus on information clarity and quick decision-making, it provides a professional, utility-focused interface for managing active sports sessions.

The system handles court assignments, player rotations, game timing, winner selection, and maintains comprehensive statistics including games played and win rates. It uses a modern tech stack with React for the frontend, Express for the backend, and supports both in-memory and database storage strategies.

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
- **Players**: id, name, level (Beginner/Intermediate/Advanced), gamesPlayed, wins, status (waiting/playing)
- **Courts**: id, name, status (available/occupied), timeRemaining, winningTeam
- **Court-Players** relationship: Many-to-many mapping between courts and players
- **Queue**: Ordered list of player IDs with position tracking
- **Notifications**: Type-based messaging system (success/warning/danger/info)

### Database Schema

**PostgreSQL with Drizzle ORM:**
- `players` table: Player profiles with skill levels and statistics
- `courts` table: Court state including availability and game timing
- `court_players` junction table: Manages which players are assigned to which courts
- `queue_entries` table: Maintains ordered waiting queue with timestamps

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