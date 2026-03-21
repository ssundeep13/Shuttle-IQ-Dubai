import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, insertSessionSchema, gameResults, gameParticipants, players, tags, playerTags } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "./db";
import { sql, eq, inArray, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, requireMarketplaceAuth, type AuthRequest } from "./auth/middleware";
import { 
  generateAccessToken, 
  generateRefreshToken, 
  comparePassword, 
  verifyRefreshToken,
  generateSessionId
} from "./auth/utils";
import {
  findAdminByEmail,
  updateAdminLastLogin,
  createAuthSession,
  findAuthSession,
  deleteAuthSession,
  deleteSessionsForUser,
  findAdminById,
  seedAdminUser,
  rotateDefaultAdminPassword
} from "./auth/storage";
import {
  buildRestStatesFromHistory,
  selectOptimalPlayers,
  findBalancedTeams,
  generateAllMatchupOptions,
  updatePlayerRestState,
  clearPlayerRestState,
  clearSessionRestStates,
  type TeamCombination
} from "./matchmaking";
import { registerMarketplaceRoutes } from "./marketplace-routes";

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed admin user on startup (dev only), then rotate legacy password (all envs)
  await seedAdminUser();
  await rotateDefaultAdminPassword();

  // Register marketplace routes
  registerMarketplaceRoutes(app);

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const admin = await findAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, admin.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      await updateAdminLastLogin(admin.id);
      
      // Delete any existing sessions for this user to prevent session conflicts
      await deleteSessionsForUser(admin.id);

      const payload = {
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await createAuthSession(admin.id, refreshToken, expiresAt);

      res.json({
        accessToken,
        refreshToken,
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await deleteAuthSession(refreshToken);
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(401).json({ error: "Refresh token required" });
      }

      const session = await findAuthSession(refreshToken);
      if (!session) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      if (new Date() > new Date(session.expiresAt)) {
        await deleteAuthSession(refreshToken);
        return res.status(401).json({ error: "Refresh token expired" });
      }

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      const admin = await findAdminById(payload.userId);
      if (!admin) {
        return res.status(401).json({ error: "User not found" });
      }

      const newAccessToken = generateAccessToken({
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const admin = await findAdminById(req.user!.userId);
      if (!admin) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: admin.id,
        email: admin.email,
        role: admin.role,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Session routes - Protected with auth
  app.post("/api/sessions", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const requestData = {
        ...req.body,
        date: new Date(req.body.date),
      };
      
      const validated = insertSessionSchema.parse(requestData);
      
      const statusToCreate = validated.status || 'active';
      if (statusToCreate === 'active') {
        const existingActive = await storage.getActiveSession();
        if (existingActive) {
          return res.status(409).json({ 
            error: "Another session is already active. End it before creating a new active session." 
          });
        }
      }
      
      const session = await storage.createSession(validated);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.post("/api/sessions/unified", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { marketplace, ...sessionData } = req.body;
      
      const requestData = {
        ...sessionData,
        date: new Date(sessionData.date),
      };
      
      const validated = insertSessionSchema.parse(requestData);
      
      const statusToCreate = validated.status || 'active';
      if (statusToCreate === 'active') {
        const existingActive = await storage.getActiveSession();
        if (existingActive) {
          return res.status(409).json({ 
            error: "Another session is already active. End it before creating a new active session." 
          });
        }
      }
      
      const session = await storage.createSession(validated);
      
      let bookableSession = null;
      if (marketplace && marketplace.enabled) {
        bookableSession = await storage.createBookableSession({
          title: marketplace.title || session.venueName,
          description: marketplace.description || null,
          venueName: session.venueName,
          venueLocation: session.venueLocation || null,
          venueMapUrl: session.venueMapUrl || null,
          date: new Date(sessionData.date),
          startTime: marketplace.startTime || '18:00',
          endTime: marketplace.endTime || '21:00',
          courtCount: session.courtCount,
          capacity: marketplace.capacity || 16,
          priceAed: marketplace.priceAed || 50,
          status: 'upcoming',
          imageUrl: null,
          linkedSessionId: session.id,
        });
      }
      
      res.status(201).json({ session, bookableSession });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
      console.error('Unified session creation error:', error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/sessions/active", async (req, res) => {
    try {
      const session = await storage.getActiveSession();
      if (!session) {
        return res.status(404).json({ error: "No active session" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get active session" });
    }
  });

  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.patch("/api/sessions/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (req.body.status === 'active' && session.status !== 'active') {
        const existingActive = await storage.getActiveSession();
        if (existingActive && existingActive.id !== req.params.id) {
          return res.status(409).json({ 
            error: "Another session is already active. End it before activating a new one." 
          });
        }
      }

      const updates = { ...req.body };
      if (updates.date && typeof updates.date === 'string') {
        updates.date = new Date(updates.date);
      }

      const updated = await storage.updateSession(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Failed to update session:', error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.delete("/api/sessions/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      // deleteSession now handles rest state clearing internally
      const deleted = await storage.deleteSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  app.post("/api/sessions/:id/end", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const session = await storage.endSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Clear rest states for this session
      clearSessionRestStates(req.params.id);
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  app.get("/api/sessions/:id/bookings", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const bookableSession = await storage.getBookableSessionByLinkedSessionId(sessionId);
      if (!bookableSession) {
        return res.json({ linked: false, bookings: [] });
      }

      const sessionBookings = await storage.getSessionBookings(bookableSession.id);
      const nonCancelled = sessionBookings.filter(b => b.status !== 'cancelled');

      const result = await Promise.all(nonCancelled.map(async (b) => {
        let player = null;
        if (b.user?.linkedPlayerId) {
          player = await storage.getPlayer(b.user.linkedPlayerId);
        }
        return {
          bookingId: b.id,
          bookingStatus: b.status,
          attendedAt: b.attendedAt,
          paymentMethod: b.paymentMethod,
          cashPaid: b.cashPaid,
          user: b.user ? {
            id: b.user.id,
            name: b.user.name,
            email: b.user.email,
            linkedPlayerId: b.user.linkedPlayerId,
          } : null,
          player: player || null,
        };
      }));

      res.json({ linked: true, bookings: result });
    } catch (error) {
      console.error('Get session bookings error:', error);
      res.status(500).json({ error: "Failed to fetch session bookings" });
    }
  });

  app.patch("/api/sessions/:id/bookings/:bookingId/checkin", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const sessionId = req.params.id;
      const bookingId = req.params.bookingId;

      const bookableSession = await storage.getBookableSessionByLinkedSessionId(sessionId);
      if (!bookableSession) {
        return res.status(404).json({ error: "No linked bookable session found" });
      }

      const booking = await storage.getBooking(bookingId);
      if (!booking || booking.sessionId !== bookableSession.id) {
        return res.status(404).json({ error: "Booking not found for this session" });
      }

      const updated = await storage.updateBooking(bookingId, {
        attendedAt: new Date(),
      });
      if (!updated) {
        return res.status(404).json({ error: "Booking not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error('Checkin booking error:', error);
      res.status(500).json({ error: "Failed to check in booking" });
    }
  });

  app.get("/api/sessions/:id/game-history", async (req, res) => {
    try {
      const { eq } = await import('drizzle-orm');
      const { players } = await import('@shared/schema');
      
      const games = await storage.getSessionGameHistory(req.params.id);
      
      // For each game, fetch participants and player details
      const gamesWithDetails = await Promise.all(
        games.map(async (game) => {
          const participants = await db.select().from(gameParticipants).where(eq(gameParticipants.gameId, game.id));
          
          const participantsWithDetails = await Promise.all(
            participants.map(async (p) => {
              const player = await db.select().from(players).where(eq(players.id, p.playerId)).limit(1);
              return {
                ...p,
                playerName: player[0]?.name || 'Unknown',
                playerLevel: player[0]?.level || 'Unknown',
              };
            })
          );
          
          return {
            ...game,
            participants: participantsWithDetails,
          };
        })
      );
      
      res.json(gamesWithDetails);
    } catch (error) {
      console.error('Session game history error:', error);
      res.status(500).json({ error: "Failed to fetch session game history" });
    }
  });

  // Edit game result (update scores)
  app.patch("/api/game-results/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { team1Score, team2Score } = req.body;
      const gameId = req.params.id;

      if (team1Score === undefined || team2Score === undefined) {
        return res.status(400).json({ error: "team1Score and team2Score are required" });
      }

      // Server-side validation: no ties allowed
      if (team1Score === team2Score) {
        return res.status(400).json({ error: "Scores cannot be tied. One team must win." });
      }

      // Get existing game result
      const [existingGame] = await db.select().from(gameResults).where(eq(gameResults.id, gameId));
      if (!existingGame) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Determine new winning team
      const newWinningTeam = team1Score > team2Score ? 1 : 2;
      const oldWinningTeam = existingGame.winningTeam;
      const winnerChanged = newWinningTeam !== oldWinningTeam;

      // Update game result
      await db.update(gameResults)
        .set({ team1Score, team2Score, winningTeam: newWinningTeam })
        .where(eq(gameResults.id, gameId));

      // Get all participants for this game
      const participants = await db.select().from(gameParticipants).where(eq(gameParticipants.gameId, gameId));
      
      // Get player details
      const playerIds = participants.map(p => p.playerId);
      const playerList = await db.select().from(players).where(inArray(players.id, playerIds));
      const playerMap = new Map(playerList.map(p => [p.id, p]));

      const { calculateSkillAdjustment, getSkillTier } = await import('@shared/utils/skillUtils');
      
      // Get opponent average skill (from baseline scores before this game)
      const team1Participants = participants.filter(p => p.team === 1);
      const team2Participants = participants.filter(p => p.team === 2);
      
      const team1AvgSkill = team1Participants.reduce((sum, p) => sum + p.skillScoreBefore, 0) / team1Participants.length;
      const team2AvgSkill = team2Participants.reduce((sum, p) => sum + p.skillScoreBefore, 0) / team2Participants.length;
      const pointDifferential = Math.abs(team1Score - team2Score);

      // Process each participant
      for (const participant of participants) {
        const player = playerMap.get(participant.playerId);
        if (!player) continue;

        const wasWinner = participant.team === oldWinningTeam;
        const isNowWinner = participant.team === newWinningTeam;
        
        // Reverse old skill change from player's current score
        const oldChange = participant.skillScoreAfter - participant.skillScoreBefore;
        const baselineSkill = player.skillScore - oldChange;
        
        // Calculate new skill adjustment from the baseline (skillScoreBefore)
        const opponentAvgSkill = participant.team === 1 ? team2AvgSkill : team1AvgSkill;

        // Fix 1: Find partner's skillScoreBefore for contribution factor
        const partnerParticipant = participants.find(
          p => p.team === participant.team && p.playerId !== participant.playerId
        );
        const partnerScoreBefore = partnerParticipant?.skillScoreBefore ?? null;
        
        const newSkillAfter = calculateSkillAdjustment(
          participant.skillScoreBefore,
          opponentAvgSkill,
          isNowWinner,
          pointDifferential,
          player.gamesPlayed || 0,
          partnerScoreBefore
        );
        
        // Calculate what player's new current skill should be
        const newChange = newSkillAfter - participant.skillScoreBefore;
        const newCurrentSkill = baselineSkill + newChange;
        const newLevel = getSkillTier(newCurrentSkill);
        
        // Update game participant record with new skill after
        await db.update(gameParticipants)
          .set({ skillScoreAfter: newSkillAfter })
          .where(and(
            eq(gameParticipants.gameId, gameId),
            eq(gameParticipants.playerId, participant.playerId)
          ));
        
        // Calculate wins adjustment only if winner changed
        const winsAdjustment = winnerChanged 
          ? (wasWinner && !isNowWinner ? -1 : (!wasWinner && isNowWinner ? 1 : 0))
          : 0;
        
        await storage.updatePlayer(participant.playerId, {
          skillScore: newCurrentSkill,
          level: newLevel,
          wins: Math.max(0, player.wins + winsAdjustment),
        });
      }

      // Return updated game with session ID for cache invalidation
      const [updatedGame] = await db.select().from(gameResults).where(eq(gameResults.id, gameId));
      res.json(updatedGame);
    } catch (error) {
      console.error('Update game result error:', error);
      res.status(500).json({ error: "Failed to update game result" });
    }
  });

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  app.get("/api/players/search", async (req, res) => {
    try {
      const query = req.query.q as string || '';
      if (!query) {
        return res.json([]);
      }
      const players = await storage.searchPlayers(query);
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to search players" });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.id);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  app.get("/api/players/:id/stats", async (req, res) => {
    try {
      const stats = await storage.getPlayerStats(req.params.id);
      if (!stats) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(stats);
    } catch (error) {
      console.error('Player stats error:', error);
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  app.post("/api/players", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();

      const validated = insertPlayerSchema.parse(req.body);
      
      // Fix 2: operators can only assign Novice/Beginner/Intermediate at creation time.
      // Advanced/Professional are earned through gameplay — cap both score and stored level.
      const ALLOWED_LEVELS: Record<string, { level: string; score: number }> = {
        'Novice':       { level: 'Novice',       score: 25 },
        'Beginner':     { level: 'Beginner',      score: 50 },
        'Intermediate': { level: 'Intermediate',  score: 90 },
        'Advanced':     { level: 'Intermediate',  score: 90 },
        'Professional': { level: 'Intermediate',  score: 90 },
      };
      const levelEntry = ALLOWED_LEVELS[validated.level] ?? { level: 'Intermediate', score: 90 };
      const skillScore = levelEntry.score;
      const normalizedLevel = levelEntry.level;
      
      const player = await storage.createPlayer({ ...validated, level: normalizedLevel, skillScore });
      
      // Only add to queue if there's an active session
      if (activeSession) {
        await storage.addToQueue(activeSession.id, player.id);
      }
      
      res.status(201).json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid player data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.patch("/api/players/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const updates = { ...req.body };
      // Keep skillScoreBaseline in sync when an admin manually edits skillScore,
      // so inactivity decay continues to use the correct anchor going forward.
      if (typeof updates.skillScore === 'number' && updates.skillScoreBaseline === undefined) {
        updates.skillScoreBaseline = updates.skillScore;
      }
      const player = await storage.updatePlayer(req.params.id, updates);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found" });
      }
      await storage.removeFromQueue(activeSession.id, req.params.id);
      
      // Clear rest state when player is removed
      clearPlayerRestState(activeSession.id, req.params.id);
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  app.post("/api/players/import", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      // Validate request body - support both URL and CSV content, plus optional sessionId
      const requestSchema = z.union([
        z.object({ 
          url: z.string().url(),
          sessionId: z.string().optional()
        }),
        z.object({ 
          csvContent: z.string(),
          sessionId: z.string().optional()
        })
      ]);
      
      const validated = requestSchema.parse(req.body);
      
      // Determine which session to add players to
      let targetSession = null;
      if (validated.sessionId) {
        // Explicit sessionId provided - validate it exists
        targetSession = await storage.getSession(validated.sessionId);
        if (!targetSession) {
          return res.status(404).json({ error: "Session not found" });
        }
      } else {
        // Fall back to active session for backward compatibility
        targetSession = await storage.getActiveSession();
      }

      let playersToImport: any[] = [];

      // Handle CSV content
      if ('csvContent' in validated) {
        const csvContent = validated.csvContent;
        
        // Limit CSV size to 1MB
        if (csvContent.length > 1024 * 1024) {
          return res.status(400).json({ 
            error: "CSV file too large",
            details: "Maximum file size is 1MB"
          });
        }

        // Parse CSV
        const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length === 0) {
          return res.status(400).json({ error: "Empty CSV file" });
        }

        // Check for header row (skip if present)
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('name') || firstLine.includes('gender') || firstLine.includes('level');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        // Parse CSV rows
        // Supports multiple formats:
        // 1. externalId, name, gender, skillScore (numeric)
        // 2. externalId, name, gender, level (text - legacy)
        // 3. name, gender, skillScore/level
        playersToImport = dataLines.map((line, index) => {
          const fields = line.split(',').map(f => f.trim());
          if (fields.length < 2) {
            throw new Error(`Invalid CSV format on line ${index + (hasHeader ? 2 : 1)}: expected at least name`);
          }
          
          const hasExternalId = fields.length >= 4;
          const skillOrLevel = hasExternalId ? fields[3] : (fields[2] || '50');
          
          // Check if last field is numeric (skillScore) or text (level)
          const isNumeric = !isNaN(Number(skillOrLevel));
          
          return {
            externalId: hasExternalId ? fields[0] : undefined,
            name: hasExternalId ? fields[1] : fields[0],
            gender: hasExternalId ? fields[2] : (fields[1] || 'Male'),
            skillScore: isNumeric ? Number(skillOrLevel) : undefined,
            level: !isNumeric ? skillOrLevel : undefined
          };
        });
      } 
      // Handle URL import
      else {
        const externalUrl = validated.url;
      
      // Security: Validate URL is from allowed hosts only
      const allowedHosts = [
        'shuttleiq.ssundeep13.repl.co',
        'shuttleiq.ssundeep13.replit.app',
        'replit.com',
        'replit.app',
        'repl.co'
      ];
      
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(externalUrl);
      } catch (error) {
        return res.status(400).json({ 
          error: "Invalid URL format",
          details: "Please provide a valid HTTP/HTTPS URL"
        });
      }
      
      // Only allow HTTPS (or HTTP for repl.co domains)
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ 
          error: "Invalid URL protocol",
          details: "Only HTTP and HTTPS protocols are allowed"
        });
      }
      
      // Check if hostname is in allowed list
      const hostname = parsedUrl.hostname;
      const isAllowed = allowedHosts.some(allowed => 
        hostname === allowed || hostname.endsWith(`.${allowed}`)
      );
      
      if (!isAllowed) {
        return res.status(403).json({ 
          error: "URL not allowed",
          details: `Only URLs from approved ShuttleIQ instances are allowed: ${allowedHosts.join(', ')}`
        });
      }
      
      // Prevent access to non-standard ports (except 80, 443)
      if (parsedUrl.port && parsedUrl.port !== '80' && parsedUrl.port !== '443') {
        return res.status(400).json({ 
          error: "Invalid port",
          details: "Only standard HTTP/HTTPS ports are allowed"
        });
      }
      
      // Fetch players from external app with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      let response;
      try {
        response = await fetch(externalUrl, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'ShuttleIQ-Import/1.0'
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === 'AbortError') {
          return res.status(504).json({ 
            error: "Request timeout",
            details: "External API did not respond within 10 seconds"
          });
        }
        return res.status(502).json({ 
          error: "Failed to connect to external app",
          details: error instanceof Error ? error.message : "Network error"
        });
      } finally {
        clearTimeout(timeout);
      }
      
      if (!response.ok) {
        return res.status(502).json({ 
          error: "Failed to fetch players from external app",
          details: `External API returned status ${response.status}`
        });
      }

      const externalPlayers = await response.json();
      
      if (!Array.isArray(externalPlayers)) {
        return res.status(502).json({ 
          error: "Invalid response from external app",
          details: "Expected an array of players"
        });
      }

      playersToImport = externalPlayers;
      }

      // Shared import logic for both CSV and URL sources
      const { getSkillTier, estimateScoreFromLegacyLevel, MIN_SKILL_SCORE, MAX_SKILL_SCORE } = await import('@shared/utils/skillUtils');
      
      const importedPlayers = [];
      const skippedPlayers = [];
      
      for (const externalPlayer of playersToImport) {
        try {
          // Determine skill score and tier
          let skillScore: number;
          let level: string;
          
          if (externalPlayer.skillScore !== undefined) {
            // Skill score provided - validate and use it
            skillScore = Math.max(MIN_SKILL_SCORE, Math.min(MAX_SKILL_SCORE, externalPlayer.skillScore));
            level = getSkillTier(skillScore);
          } else if (externalPlayer.level) {
            // Legacy level text provided - estimate score and normalize tier
            skillScore = estimateScoreFromLegacyLevel(externalPlayer.level);
            level = getSkillTier(skillScore);
          } else {
            // No skill info - default to mid-Beginner (Fix 2: lower starting point)
            skillScore = 50;
            level = 'Beginner';
          }
          
          // Validate and create player
          const playerData = {
            name: externalPlayer.name,
            gender: externalPlayer.gender || 'Male',
            level,
            skillScore,
            gamesPlayed: externalPlayer.gamesPlayed || 0,
            wins: externalPlayer.wins || 0,
            status: 'waiting'
          };
          
          const validated = insertPlayerSchema.parse(playerData);
          
          const player = await storage.createPlayer(validated);
          
          // Only add to queue if there's a target session (explicit or active)
          if (targetSession) {
            await storage.addToQueue(targetSession.id, player.id);
          }
          
          importedPlayers.push(player);
        } catch (error) {
          skippedPlayers.push({
            name: externalPlayer.name,
            reason: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      res.json({
        success: true,
        added: importedPlayers.length,
        duplicates: skippedPlayers.length,
        players: importedPlayers,
        skippedDetails: skippedPlayers
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: error.errors 
        });
      }
      res.status(500).json({ 
        error: "Failed to import players",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Court routes
  app.get("/api/courts", async (req, res) => {
    try {
      // Accept optional sessionId query parameter
      let sessionId = req.query.sessionId as string | undefined;
      
      // If no sessionId provided, fall back to active session
      if (!sessionId) {
        const activeSession = await storage.getActiveSession();
        if (!activeSession) {
          return res.json([]); // Return empty array if no active session
        }
        sessionId = activeSession.id;
      }
      
      const courts = await storage.getCourtsWithPlayers(sessionId);
      res.json(courts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch courts" });
    }
  });

  app.get("/api/courts/:id", async (req, res) => {
    try {
      const court = await storage.getCourt(req.params.id);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      const playerIds = await storage.getCourtPlayers(court.id);
      const players = (await Promise.all(
        playerIds.map(id => storage.getPlayer(id))
      )).filter(p => p !== undefined);
      
      res.json({ ...court, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch court" });
    }
  });

  app.post("/api/courts", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session. Please create a session first." });
      }

      const courtData = {
        name: req.body.name,
        sessionId: activeSession.id,
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
      };
      const court = await storage.createCourt(courtData);
      res.status(201).json({ ...court, players: [] });
    } catch (error) {
      res.status(500).json({ error: "Failed to create court" });
    }
  });

  app.patch("/api/courts/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const court = await storage.updateCourt(req.params.id, req.body);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      const playerIds = await storage.getCourtPlayers(court.id);
      const players = (await Promise.all(
        playerIds.map(id => storage.getPlayer(id))
      )).filter(p => p !== undefined);
      
      res.json({ ...court, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to update court" });
    }
  });

  app.delete("/api/courts/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const court = await storage.getCourt(req.params.id);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status === 'occupied') {
        return res.status(400).json({ error: "Cannot delete occupied court" });
      }
      
      const deleted = await storage.deleteCourt(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Court not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete court" });
    }
  });

  // Queue routes
  app.get("/api/queue", async (req, res) => {
    try {
      // Accept optional sessionId query parameter
      let sessionId = req.query.sessionId as string | undefined;
      
      // If no sessionId provided, fall back to active session
      if (!sessionId) {
        const activeSession = await storage.getActiveSession();
        if (!activeSession) {
          return res.json([]); // Return empty array if no active session
        }
        sessionId = activeSession.id;
      }
      
      const queue = await storage.getQueue(sessionId);
      res.json(queue);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  app.put("/api/queue", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      const { playerIds } = req.body;
      if (!Array.isArray(playerIds)) {
        return res.status(400).json({ error: "playerIds must be an array" });
      }
      
      // Get old queue and clone it to prevent mutation issues
      const oldQueue = [...await storage.getQueue(activeSession.id)];
      
      await storage.setQueue(activeSession.id, playerIds);
      
      // Clear rest states for players that were removed from queue
      const removedPlayerIds = oldQueue.filter(id => !playerIds.includes(id));
      for (const playerId of removedPlayerIds) {
        clearPlayerRestState(activeSession.id, playerId);
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update queue" });
    }
  });

  app.post("/api/queue/:playerId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      await storage.addToQueue(activeSession.id, req.params.playerId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to add to queue" });
    }
  });

  app.delete("/api/queue/:playerId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      await storage.removeFromQueue(activeSession.id, req.params.playerId);
      
      // Clear rest state when player is removed from queue
      clearPlayerRestState(activeSession.id, req.params.playerId);
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove from queue" });
    }
  });

  // Matchmaking routes
  app.get("/api/matchmaking/optimal-teams", async (req, res) => {
    try {
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      // Get queue and all players
      const queue = await storage.getQueue(activeSession.id);
      const allPlayers = await storage.getAllPlayers();

      if (queue.length < 4) {
        return res.status(400).json({ 
          error: "Need at least 4 players in queue",
          availablePlayers: queue.length
        });
      }

      // Build rest states from game history
      const gameParticipants = await storage.getSessionGameParticipants(activeSession.id);
      buildRestStatesFromHistory(activeSession.id, gameParticipants, queue);

      const groupByTier = req.query.groupByTier !== 'false';

      // Generate multiple matchup options with different player sets
      const { allCombinations, restWarnings } = generateAllMatchupOptions(
        activeSession.id,
        queue,
        allPlayers,
        15, // Return top 15 balanced options
        groupByTier
      );

      if (allCombinations.length === 0) {
        return res.status(400).json({ 
          error: "Not enough eligible players available (need at least 4 players in queue)",
        });
      }

      res.json({
        combinations: allCombinations,
        restWarnings
      });
    } catch (error) {
      console.error("Matchmaking error:", error);
      res.status(500).json({ error: "Failed to generate optimal teams" });
    }
  });

  // Get matchmaking suggestions for display (top 3-5 options)
  app.get("/api/matchmaking/suggestions", requireAuth, async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      
      // Get the session - either specific session or active session
      let session;
      if (sessionId) {
        session = await storage.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }
      } else {
        session = await storage.getActiveSession();
        if (!session) {
          return res.status(404).json({ error: "No active session" });
        }
      }

      // Get queue and all players
      const queue = await storage.getQueue(session.id);
      const allPlayers = await storage.getAllPlayers();

      if (queue.length < 4) {
        return res.json({ 
          suggestions: [],
          restWarnings: [],
          queueSize: queue.length,
          message: `Need ${4 - queue.length} more players in queue`
        });
      }

      // Build rest states from game history
      const gameParticipants = await storage.getSessionGameParticipants(session.id);
      buildRestStatesFromHistory(session.id, gameParticipants, queue);

      const groupByTier = req.query.groupByTier !== 'false';

      // Generate top 5 matchup options
      const { allCombinations, restWarnings } = generateAllMatchupOptions(
        session.id,
        queue,
        allPlayers,
        5, // Return top 5 suggestions
        groupByTier
      );

      res.json({
        suggestions: allCombinations,
        restWarnings,
        queueSize: queue.length
      });
    } catch (error) {
      console.error('Matchmaking suggestions error:', error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // Game management routes
  app.post("/api/courts/:courtId/assign", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { playerIds, teamAssignments } = req.body;
      
      // Support both legacy (playerIds only) and new (teamAssignments) formats
      let assignments: { playerId: string; team: number }[];
      
      if (teamAssignments && Array.isArray(teamAssignments)) {
        // New format: explicit team assignments
        assignments = teamAssignments;
      } else if (playerIds && Array.isArray(playerIds)) {
        // Legacy format: auto-split into teams
        if (playerIds.length < 2) {
          return res.status(400).json({ error: "At least 2 players required" });
        }
        const midpoint = Math.ceil(playerIds.length / 2);
        assignments = playerIds.map((playerId, index) => ({
          playerId,
          team: index < midpoint ? 1 : 2
        }));
      } else {
        return res.status(400).json({ error: "playerIds or teamAssignments required" });
      }

      // Validate exactly 2 players per team (4 total)
      const team1Count = assignments.filter(a => a.team === 1).length;
      const team2Count = assignments.filter(a => a.team === 2).length;
      
      if (team1Count !== 2 || team2Count !== 2) {
        return res.status(400).json({ 
          error: `Each team must have exactly 2 players. Team 1: ${team1Count}, Team 2: ${team2Count}` 
        });
      }

      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status === 'occupied') {
        return res.status(400).json({ error: "Court is occupied" });
      }

      // Update court status
      await storage.updateCourt(court.id, {
        status: 'occupied',
        timeRemaining: 15, // 15 minutes
        winningTeam: null,
        startedAt: new Date(),
      });

      // Set court players with team assignments
      await storage.setCourtPlayersWithTeams(court.id, assignments);

      // Update player statuses
      for (const assignment of assignments) {
        await storage.updatePlayer(assignment.playerId, { status: 'playing' });
      }

      // Remove from queue
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      const currentQueue = await storage.getQueue(activeSession.id);
      const assignedPlayerIds = assignments.map(a => a.playerId);
      const newQueue = currentQueue.filter(id => !assignedPlayerIds.includes(id));
      await storage.setQueue(activeSession.id, newQueue);

      const updatedCourt = await storage.getCourt(court.id);
      const courtPlayerData = await storage.getCourtPlayersWithTeams(court.id);
      const players = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await storage.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter(p => p !== null);

      res.json({ ...updatedCourt, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to assign players" });
    }
  });

  app.post("/api/courts/:courtId/cancel-game", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      console.log(`[CANCEL-GAME] Canceling game on court ${req.params.courtId}`);
      
      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status !== 'occupied') {
        return res.status(400).json({ error: "Court is not occupied" });
      }

      const courtPlayerData = await storage.getCourtPlayersWithTeams(court.id);
      const players = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await storage.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter((p): p is typeof p & { team: number } => p !== null);

      // Return all players to waiting status
      for (const player of players) {
        await storage.updatePlayer(player.id, { status: 'waiting' });
      }

      // Add players back to queue (maintain their original order)
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      const currentQueue = await storage.getQueue(activeSession.id);
      const newQueue = [
        ...currentQueue,
        ...players.map(p => p.id),
      ];
      await storage.setQueue(activeSession.id, newQueue);

      // Reset court
      await storage.updateCourt(court.id, {
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
        startedAt: null,
      });
      await storage.setCourtPlayers(court.id, []);

      console.log(`[CANCEL-GAME] Game canceled successfully. Players returned to queue.`);
      res.json({ message: 'Game canceled successfully' });
    } catch (error) {
      console.error(`[CANCEL-GAME] Error canceling game:`, error);
      res.status(500).json({ error: "Failed to cancel game" });
    }
  });

  app.post("/api/courts/:courtId/end-game", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { winningTeam, team1Score, team2Score } = req.body;
      
      console.log(`[END-GAME] Court ${req.params.courtId}: Team ${winningTeam} wins ${team1Score}-${team2Score}`);
      
      // Validate input
      if (winningTeam !== 1 && winningTeam !== 2) {
        console.error(`[END-GAME] Invalid winning team: ${winningTeam}`);
        return res.status(400).json({ error: "winningTeam must be 1 or 2" });
      }
      if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
        console.error(`[END-GAME] Invalid scores: team1=${team1Score}, team2=${team2Score}`);
        return res.status(400).json({ error: "team1Score and team2Score are required" });
      }
      if (team1Score < 0 || team2Score < 0) {
        console.error(`[END-GAME] Negative scores: team1=${team1Score}, team2=${team2Score}`);
        return res.status(400).json({ error: "Scores must be non-negative" });
      }

      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status !== 'occupied') {
        return res.status(400).json({ error: "Court is not occupied" });
      }

      const courtPlayerData = await storage.getCourtPlayersWithTeams(court.id);
      const players = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await storage.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter((p): p is typeof p & { team: number } => p !== null);

      // Determine winners and losers based on team assignments
      const team1 = players.filter(p => p.team === 1);
      const team2 = players.filter(p => p.team === 2);
      
      // Defensive check: ensure exactly 2 players per team
      if (team1.length !== 2 || team2.length !== 2) {
        console.error(`[END-GAME] Invalid team sizes: Team 1 has ${team1.length} players, Team 2 has ${team2.length} players`);
        console.error(`[END-GAME] Court players:`, courtPlayerData);
        return res.status(400).json({ 
          error: `Invalid team configuration. Each team must have exactly 2 players. Team 1: ${team1.length}, Team 2: ${team2.length}` 
        });
      }
      
      console.log(`[END-GAME] Team sizes validated: Team 1=${team1.length}, Team 2=${team2.length}`);
      
      const winners = winningTeam === 1 ? team1 : team2;
      const losers = winningTeam === 1 ? team2 : team1;

      // Calculate average skill scores for each team (using 10-200 scale)
      const { calculateSkillAdjustment, calculateTeamAverage, getSkillTier } = await import('@shared/utils/skillUtils');
      
      const team1AvgSkill = calculateTeamAverage(team1.map(p => p.skillScore || 50));
      const team2AvgSkill = calculateTeamAverage(team2.map(p => p.skillScore || 50));
      
      // Calculate point differential for skill adjustment
      const pointDifferential = Math.abs(team1Score - team2Score);
      
      // Track skill score changes for game history
      const participantData: Array<{
        playerId: string;
        team: number;
        skillBefore: number;
        skillAfter: number;
      }> = [];

      const now = new Date();
      const RETURN_BOOST_THRESHOLD_DAYS = 14;
      const RETURN_BOOST_GAMES = 2;
      
      for (const player of players) {
        const isWinner = winners.some(w => w.id === player.id);
        const isTeam1 = player.team === 1;
        
        const opponentAvgSkill = isTeam1 ? team2AvgSkill : team1AvgSkill;
        
        // Fix 1: Find partner score for contribution factor
        const partnerScore = players.find(p => p.team === player.team && p.id !== player.id)?.skillScore ?? null;

        // Fix 6: Determine return boost — if player was inactive 14+ days, grant 2-game boost
        const lastPlayed = player.lastPlayedAt;
        const daysInactive = lastPlayed
          ? (now.getTime() - new Date(lastPlayed).getTime()) / (24 * 60 * 60 * 1000)
          : 0;
        const isReturning = lastPlayed !== null && daysInactive >= RETURN_BOOST_THRESHOLD_DAYS;
        // Effective credits for THIS game: if returning, reset to full RETURN_BOOST_GAMES;
        // otherwise carry over existing credits unchanged (decrement happens after use).
        const currentReturnGames = isReturning ? RETURN_BOOST_GAMES : (player.returnGamesRemaining ?? 0);
        // After this game, consume one credit (floor 0). That way:
        //   comeback game: credits=2 (boost on) → stored=1
        //   2nd game back: credits=1 (boost on) → stored=0
        //   3rd game back: credits=0 (no boost)  → stored=0
        const newReturnGamesRemaining = Math.max(0, currentReturnGames - 1);

        // Calculate new skill score using ELO-style adjustment (Fix 1 + Fix 2 + Fix 6)
        const skillBefore = player.skillScore || 50;
        const skillAfter = calculateSkillAdjustment(
          skillBefore,
          opponentAvgSkill,
          isWinner,
          pointDifferential,
          player.gamesPlayed || 0,
          partnerScore,
          currentReturnGames
        );
        
        // Get updated tier based on new skill score
        const newLevel = getSkillTier(skillAfter);
        
        // Track for game history
        participantData.push({
          playerId: player.id,
          team: player.team,
          skillBefore,
          skillAfter,
        });
        
        await storage.updatePlayer(player.id, {
          gamesPlayed: player.gamesPlayed + 1,
          wins: isWinner ? player.wins + 1 : player.wins,
          skillScore: skillAfter,
          level: newLevel,
          status: 'waiting',
          lastPlayedAt: now,
          skillScoreBaseline: skillAfter, // Anchor for inactivity decay; decay is relative to this score
          returnGamesRemaining: newReturnGamesRemaining, // Fix 6: track return boost games remaining
        });
      }

      // Get active session
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.status(400).json({ error: "No active session" });
      }

      // Save game result
      const gameId = randomUUID();
      await db.insert(gameResults).values({
        id: gameId,
        courtId: court.id,
        sessionId: activeSession.id,
        team1Score,
        team2Score,
        winningTeam,
      });

      // Save game participants
      for (const participant of participantData) {
        await db.insert(gameParticipants).values({
          gameId,
          playerId: participant.playerId,
          team: participant.team,
          skillScoreBefore: participant.skillBefore,
          skillScoreAfter: participant.skillAfter,
        });
      }

      // Update rest states: players who just played have their consecutive count incremented
      for (const participant of participantData) {
        updatePlayerRestState(activeSession.id, participant.playerId, true);
      }
      
      // Update rest states for players who were waiting (reset their consecutive count)
      const currentQueue = await storage.getQueue(activeSession.id);
      const playedPlayerIds = new Set(participantData.map(p => p.playerId));
      
      for (const playerId of currentQueue) {
        if (!playedPlayerIds.has(playerId)) {
          updatePlayerRestState(activeSession.id, playerId, false);
        }
      }

      // Add players back to queue (losers first, then winners)
      const newQueue = [
        ...currentQueue,
        ...losers.map(p => p.id),
        ...winners.map(p => p.id),
      ];
      await storage.setQueue(activeSession.id, newQueue);

      // Reset court
      await storage.updateCourt(court.id, {
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
        startedAt: null,
      });
      await storage.setCourtPlayers(court.id, []);

      const updatedCourt = await storage.getCourt(court.id);
      console.log(`[END-GAME] Game ended successfully. Court ${court.id} now ${updatedCourt?.status}. Players returned to queue.`);
      res.json({ ...updatedCourt, players: [] });
    } catch (error) {
      console.error(`[END-GAME] Error ending game:`, error);
      res.status(500).json({ error: "Failed to end game" });
    }
  });

  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      // Accept optional sessionId query parameter
      let sessionId = req.query.sessionId as string | undefined;
      
      // If no sessionId provided, fall back to active session
      if (!sessionId) {
        const activeSession = await storage.getActiveSession();
        if (!activeSession) {
          return res.json({
            activePlayers: 0,
            inQueue: 0,
            availableCourts: 0,
            occupiedCourts: 0,
            totalPlayers: 0,
            totalCourts: 0,
          });
        }
        sessionId = activeSession.id;
      }

      const courts = await storage.getCourtsBySession(sessionId);
      const queue = await storage.getQueue(sessionId);
      
      // Get session-specific players (those in the queue for this session)
      // Note: queue is already an array of player IDs
      const allPlayers = await storage.getAllPlayers();
      const sessionPlayers = allPlayers.filter(p => queue.includes(p.id));

      const stats = {
        activePlayers: sessionPlayers.filter((p: any) => p.status === 'playing').length,
        inQueue: queue.length,
        availableCourts: courts.filter((c: any) => c.status === 'available').length,
        occupiedCourts: courts.filter((c: any) => c.status === 'occupied').length,
        totalPlayers: sessionPlayers.length, // Session-specific count
        totalCourts: courts.length,
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Today's stats endpoint for leaderboard
  app.get("/api/stats/today", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      
      // Get start of today (midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get all games from today
      const todaysGames = await db
        .select()
        .from(gameResults)
        .where(sql`${gameResults.createdAt} >= ${today}`);
      
      const gameIds = todaysGames.map(g => g.id);
      
      if (gameIds.length === 0) {
        // No games today, return all players with 0 stats
        const playersWithStats = players.map(p => ({
          ...p,
          gamesPlayedToday: 0,
          winsToday: 0,
        }));
        return res.json(playersWithStats);
      }
      
      // Get all participants from today's games
      const participants = await db
        .select()
        .from(gameParticipants)
        .where(sql`${gameParticipants.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`);
      
      // Calculate stats for each player
      const playersWithStats = players.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedToday = playerParticipations.length;
        
        // Count wins: player must be on winning team
        let winsToday = 0;
        for (const participation of playerParticipations) {
          const game = todaysGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsToday++;
          }
        }
        
        return {
          ...player,
          gamesPlayedToday,
          winsToday,
        };
      });
      
      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-TODAY] Error:', error);
      res.status(500).json({ error: "Failed to fetch today's stats" });
    }
  });

  // Weekly stats endpoint for leaderboard (current week, Mon–Sun)
  app.get("/api/stats/week", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();

      // Get start of current week (Monday at midnight)
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
      const daysFromMonday = (dayOfWeek + 6) % 7; // days since last Monday
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - daysFromMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      const weekGames = await db
        .select()
        .from(gameResults)
        .where(sql`${gameResults.createdAt} >= ${startOfWeek}`);

      const gameIds = weekGames.map(g => g.id);

      if (gameIds.length === 0) {
        return res.json(players.map(p => ({ ...p, gamesPlayedThisWeek: 0, winsThisWeek: 0 })));
      }

      const participants = await db
        .select()
        .from(gameParticipants)
        .where(sql`${gameParticipants.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`);

      const playersWithStats = players.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedThisWeek = playerParticipations.length;
        let winsThisWeek = 0;
        for (const participation of playerParticipations) {
          const game = weekGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsThisWeek++;
          }
        }
        return { ...player, gamesPlayedThisWeek, winsThisWeek };
      });

      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-WEEK] Error:', error);
      res.status(500).json({ error: "Failed to fetch this week's stats" });
    }
  });

  // Monthly stats endpoint for leaderboard
  app.get("/api/stats/month/:year/:month", async (req, res) => {
    try {
      const year = parseInt(req.params.year);
      const month = parseInt(req.params.month); // 1-12
      
      // Validate month range
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }
      
      // Validate year range (reasonable bounds: 2020-2100)
      if (year < 2020 || year > 2100) {
        return res.status(400).json({ error: "Year must be between 2020 and 2100" });
      }
      
      const players = await storage.getAllPlayers();
      
      // Get start and end of the month
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
      
      // Get all games from the specified month
      const monthGames = await db
        .select()
        .from(gameResults)
        .where(sql`${gameResults.createdAt} >= ${startOfMonth} AND ${gameResults.createdAt} <= ${endOfMonth}`);
      
      const gameIds = monthGames.map(g => g.id);
      
      if (gameIds.length === 0) {
        // No games this month, return all players with 0 stats
        const playersWithStats = players.map(p => ({
          ...p,
          gamesPlayedInMonth: 0,
          winsInMonth: 0,
        }));
        return res.json(playersWithStats);
      }
      
      // Get all participants from month's games
      const participants = await db
        .select()
        .from(gameParticipants)
        .where(sql`${gameParticipants.gameId} IN (${sql.join(gameIds.map(id => sql`${id}`), sql`, `)})`);
      
      // Calculate stats for each player
      const playersWithStats = players.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedInMonth = playerParticipations.length;
        
        // Count wins: player must be on winning team
        let winsInMonth = 0;
        for (const participation of playerParticipations) {
          const game = monthGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsInMonth++;
          }
        }
        
        return {
          ...player,
          gamesPlayedInMonth,
          winsInMonth,
        };
      });
      
      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-MONTH] Error:', error);
      res.status(500).json({ error: "Failed to fetch monthly stats" });
    }
  });

  // Get session-specific player stats
  app.get("/api/stats/session/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Verify session exists
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Get all players in the session's queue
      // Note: queue is already an array of player IDs (strings)
      const queue = await storage.getQueue(sessionId);
      const queuePlayerIds = queue;
      
      // Get all games from this session
      const sessionGames = await db
        .select()
        .from(gameResults)
        .where(eq(gameResults.sessionId, sessionId));
      
      const gameIds = sessionGames.map(g => g.id);
      
      if (gameIds.length === 0) {
        // No games in session, return queue players with 0 stats
        const players = await storage.getAllPlayers();
        const queuePlayers = players.filter(p => queuePlayerIds.includes(p.id));
        const playersWithStats = queuePlayers.map(p => ({
          ...p,
          gamesPlayedInSession: 0,
          winsInSession: 0,
        }));
        return res.json(playersWithStats);
      }
      
      // Get all participants from session's games
      const participants = await db
        .select()
        .from(gameParticipants)
        .where(inArray(gameParticipants.gameId, gameIds));
      
      // Get all players
      const allPlayers = await storage.getAllPlayers();
      
      // Filter to only players who have participated in this session or are in queue
      const participantPlayerIds = Array.from(new Set(participants.map(p => p.playerId)));
      const relevantPlayerIds = Array.from(new Set([...queuePlayerIds, ...participantPlayerIds]));
      const relevantPlayers = allPlayers.filter(p => relevantPlayerIds.includes(p.id));
      
      // Calculate stats for each player in this session
      const playersWithStats = relevantPlayers.map(player => {
        const playerParticipations = participants.filter(p => p.playerId === player.id);
        const gamesPlayedInSession = playerParticipations.length;
        
        // Count wins: player must be on winning team
        let winsInSession = 0;
        for (const participation of playerParticipations) {
          const game = sessionGames.find(g => g.id === participation.gameId);
          if (game && game.winningTeam === participation.team) {
            winsInSession++;
          }
        }
        
        return {
          ...player,
          gamesPlayedInSession,
          winsInSession,
        };
      });
      
      res.json(playersWithStats);
    } catch (error) {
      console.error('[STATS-SESSION] Error:', error);
      res.status(500).json({ error: "Failed to fetch session stats" });
    }
  });

  // Reset all games endpoint
  app.delete("/api/game-history", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      console.log('[RESET-GAMES] Starting full reset (games, stats, and courts)...');
      
      // Delete all game participants first (foreign key constraint)
      await db.delete(gameParticipants);
      console.log('[RESET-GAMES] Game participants deleted');
      
      // Delete all game results
      await db.delete(gameResults);
      console.log('[RESET-GAMES] Game results deleted');
      
      // Reset all player statistics
      const allPlayers = await storage.getAllPlayers();
      for (const player of allPlayers) {
        // Reset stats based on initial skill levels (Fix 2: Novice=25, Beginner=50, Intermediate=90)
        const resetScoreMap: Record<string, number> = {
          'Novice': 25,
          'Beginner': 50,
          'Intermediate': 90,
          'Advanced': 90,       // Advanced/Professional earned through play; reset to Intermediate
          'Professional': 90,
        };
        const initialSkillScore = resetScoreMap[player.level] ?? 50;
        
        await storage.updatePlayer(player.id, {
          gamesPlayed: 0,
          wins: 0,
          skillScore: initialSkillScore,
          skillScoreBaseline: initialSkillScore,
          returnGamesRemaining: 0,
          status: 'waiting',
        });
      }
      console.log('[RESET-GAMES] Player statistics reset');
      
      // Clear all court assignments and reset court states
      const activeSession = await storage.getActiveSession();
      if (activeSession) {
        const allCourts = await storage.getCourtsBySession(activeSession.id);
        for (const court of allCourts) {
          // Clear all players from this court
          await storage.setCourtPlayers(court.id, []);
          
          // Reset court to available state
          await storage.updateCourt(court.id, {
            status: 'available',
            timeRemaining: 0,
            winningTeam: null,
          });
        }
        console.log('[RESET-GAMES] Courts cleared and reset to available');
      }
      
      console.log('[RESET-GAMES] Full reset completed successfully');
      res.json({ message: 'All games, stats, and courts have been reset' });
    } catch (error) {
      console.error('[RESET-GAMES] Error:', error);
      res.status(500).json({ error: "Failed to reset game history" });
    }
  });

  // Game History endpoint
  app.get("/api/game-history/:sessionId?", async (req, res) => {
    try {
      const { eq, desc } = await import('drizzle-orm');
      const { players } = await import('@shared/schema');
      const sessionId = req.params.sessionId;
      
      // Fetch game results for the specific session (or all if no sessionId provided)
      const gamesQuery = sessionId 
        ? db.select().from(gameResults).where(eq(gameResults.sessionId, sessionId)).orderBy(desc(gameResults.createdAt))
        : db.select().from(gameResults).orderBy(desc(gameResults.createdAt));
      
      const games = await gamesQuery;
      
      // For each game, fetch participants and player details
      const gamesWithDetails = await Promise.all(
        games.map(async (game) => {
          const participants = await db.select().from(gameParticipants).where(eq(gameParticipants.gameId, game.id));
          
          // Fetch player details for each participant
          const participantsWithDetails = await Promise.all(
            participants.map(async (p) => {
              const player = await db.select().from(players).where(eq(players.id, p.playerId)).limit(1);
              return {
                ...p,
                playerName: player[0]?.name || 'Unknown',
                playerLevel: player[0]?.level || 'Unknown',
              };
            })
          );
          
          return {
            ...game,
            participants: participantsWithDetails,
          };
        })
      );
      
      res.json(gamesWithDetails);
    } catch (error) {
      console.error('Game history error:', error);
      res.status(500).json({ error: "Failed to fetch game history" });
    }
  });

  // ── Player Personality Tags ────────────────────────────────────────────────

  // GET /api/tags/game/:gameResultId/participants – participants for a game
  app.get("/api/tags/game/:gameResultId/participants", async (req, res) => {
    try {
      const info = await storage.getGameParticipantInfo(req.params.gameResultId);
      res.json(info);
    } catch {
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  // GET /api/tags – list all active tags (flat array for frontend grouping)
  app.get("/api/tags", async (_req, res) => {
    try {
      const allTags = await storage.getAllTags();
      res.json(allTags);
    } catch {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // GET /api/tags/trending – top tags in last 7 days
  app.get("/api/tags/trending", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 5;
      const trending = await storage.getTrendingTags(limit);
      res.json(trending);
    } catch {
      res.status(500).json({ error: "Failed to fetch trending tags" });
    }
  });

  // GET /api/tags/player/:playerId – top tags for a specific player
  app.get("/api/tags/player/:playerId", async (req, res) => {
    try {
      const { playerId } = req.params;
      const limit = Number(req.query.limit) || 3;
      const topTags = await storage.getPlayerTopTags(playerId, limit);
      res.json(topTags);
    } catch {
      res.status(500).json({ error: "Failed to fetch player tags" });
    }
  });

  // GET /api/tags/:tagId/players – players tagged with a specific tag
  app.get("/api/tags/:tagId/players", async (req, res) => {
    try {
      const { tagId } = req.params;
      const limit = Number(req.query.limit) || 10;
      const tagged = await storage.getPlayersWithTag(tagId, limit);
      res.json(tagged);
    } catch {
      res.status(500).json({ error: "Failed to fetch players with tag" });
    }
  });

  // GET /api/tags/game/:gameResultId/mine – tags already submitted by the caller for a game
  app.get("/api/tags/game/:gameResultId/mine", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.json([]);
      const existing = await storage.getPlayerTagsForGame(req.params.gameResultId, mpUser.linkedPlayerId);
      res.json(existing);
    } catch {
      res.status(500).json({ error: "Failed to fetch tags for game" });
    }
  });

  // GET /api/tags/tagged-games – game IDs the caller has already tagged (requires marketplace auth)
  app.get("/api/tags/tagged-games", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.json([]);
      const gameIds = await storage.getTaggedGameIds(mpUser.linkedPlayerId);
      res.json(gameIds);
    } catch {
      res.status(500).json({ error: "Failed to fetch tagged game IDs" });
    }
  });

  // POST /api/tags/game/:gameResultId – submit tags for teammates in a game
  app.post("/api/tags/game/:gameResultId", requireAuth, requireMarketplaceAuth, async (req: AuthRequest, res) => {
    try {
      const mpUser = await storage.getMarketplaceUser(req.user!.userId);
      if (!mpUser?.linkedPlayerId) return res.status(403).json({ error: "Link your player profile first" });

      const { gameResultId } = req.params;
      const schema = z.object({
        tags: z.array(z.object({ targetPlayerId: z.string(), tagId: z.string() })).min(1).max(8),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

      const callerId = mpUser.linkedPlayerId;

      // Validate: caller must be a participant in this game
      const participants = await storage.getGameParticipantInfo(gameResultId);
      if (participants.length === 0) return res.status(400).json({ error: "Game not found" });

      // Enforce 30-day tagging window
      const [gameRow] = await db.select({ createdAt: gameResults.createdAt }).from(gameResults).where(eq(gameResults.id, gameResultId));
      if (gameRow) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (gameRow.createdAt < thirtyDaysAgo) {
          return res.status(400).json({ error: "Tagging window has closed (30 days after the game)" });
        }
      }
      if (!participants.some(p => p.id === callerId)) {
        return res.status(403).json({ error: "You were not in this game" });
      }

      const participantIds = new Set(participants.map(p => p.id));

      // Validate all tag IDs exist in the catalog
      const requestedTagIds = [...new Set(parsed.data.tags.map(t => t.tagId))];
      const validTagRows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, requestedTagIds));
      const validTagIds = new Set(validTagRows.map(r => r.id));
      const invalidTagId = requestedTagIds.find(id => !validTagIds.has(id));
      if (invalidTagId) return res.status(400).json({ error: `Unknown tag: ${invalidTagId}` });

      // Anti-abuse: validate each entry strictly
      const existingTags = await storage.getPlayerTagsForGame(gameResultId, callerId);
      const existingTargetCounts: Record<string, number> = {};
      for (const et of existingTags) {
        existingTargetCounts[et.taggedPlayerId] = (existingTargetCounts[et.taggedPlayerId] || 0) + 1;
      }

      // Check for self-tagging
      const selfTag = parsed.data.tags.find(t => t.targetPlayerId === callerId);
      if (selfTag) return res.status(400).json({ error: "You cannot tag yourself" });

      // Check all targets are valid game participants
      const invalidTarget = parsed.data.tags.find(t => !participantIds.has(t.targetPlayerId));
      if (invalidTarget) return res.status(400).json({ error: `Player ${invalidTarget.targetPlayerId} was not in this game` });

      // Check max 2 tags per target across new submission (count new tags per target)
      const newTargetCounts: Record<string, number> = {};
      for (const t of parsed.data.tags) {
        newTargetCounts[t.targetPlayerId] = (newTargetCounts[t.targetPlayerId] || 0) + 1;
      }
      for (const [targetId, newCount] of Object.entries(newTargetCounts)) {
        const existing = existingTargetCounts[targetId] || 0;
        if (existing + newCount > 2) {
          return res.status(409).json({ error: `Maximum 2 tags per player per game (player ${targetId})` });
        }
      }

      // Check exact duplicate tag+target for existing records
      for (const t of parsed.data.tags) {
        const dup = existingTags.find(et => et.taggedPlayerId === t.targetPlayerId && et.tagId === t.tagId);
        if (dup) return res.status(409).json({ error: "Duplicate tag: you already gave this tag to this player in this game" });
      }

      // Check duplicates within this submission (same target+tag twice)
      const submissionKeys = parsed.data.tags.map(t => `${t.targetPlayerId}:${t.tagId}`);
      if (new Set(submissionKeys).size !== submissionKeys.length) {
        return res.status(409).json({ error: "Duplicate tag in submission" });
      }

      const entries = parsed.data.tags.map(t => ({
        taggedPlayerId: t.targetPlayerId,
        taggedByPlayerId: callerId,
        tagId: t.tagId,
        gameResultId,
      }));

      const created = await storage.createPlayerTags(entries);
      res.status(201).json({ created: created.length });
    } catch (err) {
      console.error("Tag submission error:", err);
      res.status(500).json({ error: "Failed to submit tags" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
