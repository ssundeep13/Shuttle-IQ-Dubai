# ShuttleIQ - Design Guidelines

## Design Approach: Modern Dashboard System

**Selected Approach:** Material Design with custom sports-focused adaptations  
**Justification:** This is a utility-focused, information-dense dashboard requiring clear data visualization, real-time updates, and efficient court/player management. Material Design provides excellent patterns for cards, lists, and status indicators while maintaining clarity at scale.

**Core Design Principles:**
- Information clarity over decoration
- Quick scanning and decision-making
- Real-time status visibility
- Professional sports facility aesthetic
- Minimal cognitive load for operators

---

## Core Design Elements

### A. Color Palette

**Brand Colors (Already Established):**
- Primary: 210 100% 21% (Deep Ocean Blue - #003d6b)
- Secondary: 178 100% 31% (Teal - #00a19c)
- Accent: 199 95% 62% (Sky Blue - #38BDF8)

**Extended Palette:**

Light Mode:
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Surface Elevated: 210 40% 98%
- Text Primary: 210 30% 15%
- Text Secondary: 210 15% 45%
- Border: 210 20% 88%

Dark Mode:
- Background: 210 30% 8%
- Surface: 210 25% 12%
- Surface Elevated: 210 25% 16%
- Text Primary: 210 15% 95%
- Text Secondary: 210 10% 70%
- Border: 210 20% 24%

**Status Colors:**
- Success/Available: 142 71% 45% (Green)
- Warning/Time Running Out: 38 92% 50% (Amber)
- Danger/Remove: 0 72% 51% (Red)
- Info/Occupied: 199 95% 62% (Accent Blue)
- Waiting/Queue: 210 15% 60% (Gray)

### B. Typography

**Font Stack:**
- Primary: Inter (via Google Fonts CDN)
- Fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif

**Scale:**
- Display/Hero: text-4xl font-bold (36px)
- Page Headers: text-2xl font-semibold (24px)
- Section Headers: text-xl font-semibold (20px)
- Card Titles: text-lg font-medium (18px)
- Body Text: text-base font-normal (16px)
- Small Text/Meta: text-sm font-normal (14px)
- Tiny/Labels: text-xs font-medium (12px)

**Line Heights:**
- Headlines: leading-tight (1.25)
- Body: leading-relaxed (1.625)
- Compact lists: leading-normal (1.5)

### C. Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16
- Tight spacing (cards, lists): p-4, gap-2
- Standard spacing (sections): p-6, gap-4
- Generous spacing (between major sections): p-8, gap-6
- Large spacing (page padding): p-12

**Grid System:**
- Desktop: 3-column layout (Courts | Queue | Stats)
- Tablet: 2-column layout (Courts + Queue | Stats below)
- Mobile: Single column stack

**Container Widths:**
- Max width: max-w-7xl (1280px)
- Court cards: Fluid within grid
- Player lists: Fluid with scroll

### D. Component Library

**Navigation/Header:**
- Fixed top bar with app branding
- Tab navigation: Courts | Queue | Players | Statistics
- Quick action buttons (Add Player, Add Court)
- Notification bell with badge count
- Primary color background (210 100% 21%)

**Court Cards:**
- Large card with court number/name header
- Status indicator badge (Available/Occupied with color-coded backgrounds)
- Player list (4 slots with avatars/initials)
- Timer display (circular progress or linear countdown)
- Team selection buttons when occupied
- End Game button (primary action)
- Elevation: shadow-md, hover: shadow-lg

**Player Queue:**
- Scrollable list of player cards
- Checkbox selection for manual assignment
- Player info: Name, Level badge, Stats mini-display
- Drag handles for reordering (optional enhancement)
- Remove button (subtle, appears on hover)
- Compact card design: p-3

**Statistics Dashboard:**
- Metric cards: Games Played, Win Rate, Active Players
- Leaderboard table with sorting
- Level distribution chart (simple bar visualization)
- Bordered table with alternating row colors

**Buttons:**
- Primary: bg-[#003d6b] text-white, rounded-lg, px-4 py-2
- Secondary: bg-[#00a19c] text-white
- Outline: border-2 border-current, transparent background
- Danger: bg-red-500 text-white
- Icon buttons: p-2, rounded-full on hover background

**Forms:**
- Input fields: border-2, rounded-lg, px-4 py-3, focus:ring-2
- Select dropdowns: Custom styled with chevron icon
- Add player modal: Centered overlay with backdrop blur

**Notifications:**
- Toast notifications: Fixed bottom-right
- 5-second auto-dismiss
- Color-coded by type (success, warning, error, info)
- Icon + message + dismiss button
- Slide-in animation from right

**Status Indicators:**
- Badge pills: rounded-full, px-3 py-1, text-xs font-medium
- Color-coded backgrounds matching status palette
- Court status: Large, prominent in card header
- Player status: Subtle, alongside name

### E. Animations

**Minimal, Purposeful Only:**
- Toast slide-in/out: 200ms ease
- Card hover elevation: 150ms ease
- Button press scale: 100ms ease (scale-95 active state)
- Tab indicator slide: 200ms ease
- Modal fade + scale: 200ms ease
- Timer countdown: Smooth transition for visual feedback only
- **No**: Spinning elements, bouncing, complex keyframes, or distracting effects

---

## Responsive Behavior

**Desktop (lg: 1024px+):** 3-column layout, all courts visible, side-by-side queue and stats

**Tablet (md: 768px):** 2-column, courts grid (2x2), queue below, stats in separate tab or collapsible

**Mobile (base):** Single column stack, court cards full width, horizontal scroll for player slots if needed, sticky header with tab navigation

---

## Key UX Patterns

- **Visual Hierarchy:** Court status is immediately scannable via color and size
- **Action Proximity:** Primary actions (Assign, End Game) adjacent to relevant context
- **Feedback:** Every action triggers notification confirming success/failure
- **Progressive Disclosure:** Detailed stats in dedicated view, court cards show essentials only
- **Color Coding:** Consistent use of status colors throughout (available=green, occupied=blue, warning=amber)