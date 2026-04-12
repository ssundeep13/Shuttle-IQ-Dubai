import { storage } from "./storage";

const BASE_URL = "https://shuttleiq.org";
const OG_IMAGE = `${BASE_URL}/icons/icon-512x512.png`;
const DEFAULT_DESC = "Book badminton sessions across the UAE. Live rankings, ELO skill ratings, smart matchmaking, and real-time queue management. Join the community at ShuttleIQ.";

interface PageMeta {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
}

interface RoutePattern {
  pattern: RegExp;
  meta: PageMeta | ((match: RegExpMatchArray) => Promise<PageMeta>);
}

const staticRoutes: Record<string, PageMeta> = {
  "/": {
    title: "ShuttleIQ — Book Badminton Sessions in UAE",
    description: DEFAULT_DESC,
  },
  "/marketplace": {
    title: "ShuttleIQ — Book Badminton Sessions in UAE",
    description: DEFAULT_DESC,
  },
  "/marketplace/book": {
    title: "Book a Session | ShuttleIQ",
    description: "Browse upcoming badminton sessions across the UAE. Pick your slot, invite friends, and pay online. Sessions fill fast — book now.",
  },
  "/marketplace/rankings": {
    title: "Rankings | ShuttleIQ",
    description: "See who's on top. Live badminton rankings with ELO-style skill ratings updated after every match. Filter by all-time, monthly, or weekly performance.",
  },
  "/marketplace/login": {
    title: "Login | ShuttleIQ",
    description: "Sign in to your ShuttleIQ account to book sessions, track your stats, and climb the rankings.",
  },
  "/marketplace/signup": {
    title: "Sign Up | ShuttleIQ",
    description: "Join ShuttleIQ — the badminton community in the UAE. Create your free account to book sessions, track your skill score, and compete on the leaderboard.",
  },
  "/marketplace/dashboard": {
    title: "Dashboard | ShuttleIQ",
    description: "Your ShuttleIQ dashboard — next sessions, stats at a glance, and community activity.",
  },
  "/marketplace/my-scores": {
    title: "My Scores | ShuttleIQ",
    description: "Track your badminton performance — skill score, win rate, game history, and ranking progression all in one place.",
  },
  "/marketplace/my-bookings": {
    title: "My Bookings | ShuttleIQ",
    description: "View and manage your upcoming and past badminton session bookings.",
  },
  "/marketplace/game-history": {
    title: "Game History | ShuttleIQ",
    description: "Review your match history — scores, opponents, and results from every game you've played.",
  },
  "/marketplace/profile": {
    title: "Profile | ShuttleIQ",
    description: "Manage your ShuttleIQ profile and account settings.",
  },
  "/marketplace/scoring-guide": {
    title: "Scoring Guide | ShuttleIQ",
    description: "Understand how ShuttleIQ's ELO-style skill rating system works — how points are earned, tiers are assigned, and rankings are calculated.",
  },
  "/marketplace/join-the-crew": {
    title: "Join the Crew | ShuttleIQ",
    description: "Become a ShuttleIQ session organizer. Run badminton sessions, manage courts, and grow your community.",
  },
  "/marketplace/reset-password": {
    title: "Reset Password | ShuttleIQ",
    description: "Reset your ShuttleIQ account password.",
  },
};

const dynamicRoutes: RoutePattern[] = [
  {
    pattern: /^\/marketplace\/players\/([^/]+)\/personality-card$/,
    meta: async (match) => {
      const player = await findPlayer(match[1]);
      const name = player?.name ?? "Player";
      return {
        title: `${name} — Personality Card | ShuttleIQ`,
        description: `${name}'s ShuttleIQ personality card — community tags, play style, and reputation earned on the court.`,
      };
    },
  },
  {
    pattern: /^\/marketplace\/players\/([^/]+)$/,
    meta: async (match) => {
      const player = await findPlayer(match[1]);
      const name = player?.name ?? "Player";
      const score = player?.skillScore ?? 0;
      const level = player?.level ?? "";
      return {
        title: `${name} | ShuttleIQ Player Profile`,
        description: `${name}'s badminton profile on ShuttleIQ — Skill Score: ${score}, Tier: ${formatTier(level)}. View stats, match history, and community tags.`,
      };
    },
  },
  {
    pattern: /^\/marketplace\/sessions\/([^/]+)$/,
    meta: async () => ({
      title: "Session Details | ShuttleIQ",
      description: "View session details, see who's playing, and book your spot.",
    }),
  },
  {
    pattern: /^\/marketplace\/checkout\/([^/]+)$/,
    meta: async () => ({
      title: "Checkout | ShuttleIQ",
      description: "Complete your badminton session booking.",
    }),
  },
];

async function findPlayer(id: string) {
  let player = await storage.getPlayer(id);
  if (!player && id.startsWith("SIQ-")) {
    player = await storage.getPlayerByShuttleIqId(id);
  }
  return player;
}

function formatTier(level: string): string {
  switch (level) {
    case "lower_intermediate": return "Intermediate";
    case "upper_intermediate": return "Competitive";
    case "Professional": return "Professional";
    case "Advanced": return "Advanced";
    case "Beginner": return "Beginner";
    case "Novice": return "Novice";
    default: return level;
  }
}

export async function getMetaForUrl(url: string): Promise<PageMeta | null> {
  const pathname = url.split("?")[0].replace(/\/+$/, "") || "/";

  const staticMeta = staticRoutes[pathname];
  if (staticMeta) return staticMeta;

  for (const route of dynamicRoutes) {
    const match = pathname.match(route.pattern);
    if (match) {
      try {
        if (typeof route.meta === "function") {
          return await route.meta(match);
        }
        return route.meta;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function injectMeta(html: string, meta: PageMeta): string {
  const title = escapeHtml(meta.title);
  const desc = escapeHtml(meta.description);
  const image = meta.ogImage ?? OG_IMAGE;
  const canonicalPath = meta.canonical ?? "/";
  const canonical = canonicalPath.startsWith("http") ? canonicalPath : `${BASE_URL}${canonicalPath}`;

  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title}</title>`
  );

  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${desc}" />`
  );

  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${title}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${desc}" />`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${escapeHtml(image)}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${title}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${desc}" />`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`
  );

  return html;
}
