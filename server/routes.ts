import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, insertSessionSchema, gameResults, gameParticipants } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "./db";
import { sql, eq, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, type AuthRequest } from "./auth/middleware";
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
  findAdminById,
  seedAdminUser
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Seed admin user on startup
  await seedAdminUser();

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
      // Transform date string to Date object before validation
      const requestData = {
        ...req.body,
        date: new Date(req.body.date),
      };
      
      const validated = insertSessionSchema.parse(requestData);
      const session = await storage.createSession(validated);
      
      // DO NOT auto-add all players to the queue
      // Players should be explicitly added to specific sessions only
      // Either via player import with sessionId, or manually added later
      
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid session data", details: error.errors });
      }
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

      // Update session (currently only supports status updates)
      const updated = await storage.updateSession(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
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

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch players" });
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

  app.post("/api/players", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const activeSession = await storage.getActiveSession();

      const validated = insertPlayerSchema.parse(req.body);
      
      // Set initial skill score based on gender + level (10-200 scale)
      const skillScoreMap: Record<string, number> = {
        'Novice': validated.gender === 'Female' ? 10 : 20,
        'Beginner-': validated.gender === 'Female' ? 30 : 40,
        'Beginner': validated.gender === 'Female' ? 50 : 60,
        'Beginner+': validated.gender === 'Female' ? 70 : 80,
        'Intermediate-': validated.gender === 'Female' ? 90 : 100,
        'Intermediate': validated.gender === 'Female' ? 110 : 120,
        'Intermediate+': validated.gender === 'Female' ? 130 : 140,
        'Advanced': validated.gender === 'Female' ? 150 : 160,
        'Advanced+': validated.gender === 'Female' ? 170 : 180,
        'Professional': validated.gender === 'Female' ? 190 : 200,
      };
      
      const skillScore = skillScoreMap[validated.level] || 100;
      
      const player = await storage.createPlayer({ ...validated, skillScore });
      
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
      const player = await storage.updatePlayer(req.params.id, req.body);
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

        // Parse CSV rows (format: externalId, name, gender, level)
        playersToImport = dataLines.map((line, index) => {
          const fields = line.split(',').map(f => f.trim());
          if (fields.length < 2) {
            throw new Error(`Invalid CSV format on line ${index + (hasHeader ? 2 : 1)}: expected at least name`);
          }
          
          // Support both formats:
          // 1. externalId, name, gender, level
          // 2. name, gender, level
          const hasExternalId = fields.length >= 4;
          return {
            externalId: hasExternalId ? fields[0] : undefined,
            name: hasExternalId ? fields[1] : fields[0],
            gender: hasExternalId ? fields[2] : (fields[1] || 'Male'),
            level: hasExternalId ? fields[3] : (fields[2] || 'Beginner')
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
      const importedPlayers = [];
      const skippedPlayers = [];
      
      for (const externalPlayer of playersToImport) {
        try {
          // Validate and create player
          const playerData = {
            name: externalPlayer.name,
            gender: externalPlayer.gender || 'Male',
            level: externalPlayer.level || 'Beginner',
            gamesPlayed: externalPlayer.gamesPlayed || 0,
            wins: externalPlayer.wins || 0,
            status: 'waiting'
          };
          
          const validated = insertPlayerSchema.parse(playerData);
          
          // Set initial skill score based on gender + level (10-200 scale)
          const skillScoreMap: Record<string, number> = {
            'Novice': validated.gender === 'Female' ? 10 : 20,
            'Beginner-': validated.gender === 'Female' ? 30 : 40,
            'Beginner': validated.gender === 'Female' ? 50 : 60,
            'Beginner+': validated.gender === 'Female' ? 70 : 80,
            'Intermediate-': validated.gender === 'Female' ? 90 : 100,
            'Intermediate': validated.gender === 'Female' ? 110 : 120,
            'Intermediate+': validated.gender === 'Female' ? 130 : 140,
            'Advanced': validated.gender === 'Female' ? 150 : 160,
            'Advanced+': validated.gender === 'Female' ? 170 : 180,
            'Professional': validated.gender === 'Female' ? 190 : 200,
          };
          
          const skillScore = skillScoreMap[validated.level] || 100;
          
          const player = await storage.createPlayer({ ...validated, skillScore });
          
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
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.json([]); // Return empty array if no active session
      }
      const courts = await storage.getCourtsWithPlayers(activeSession.id);
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
      const activeSession = await storage.getActiveSession();
      if (!activeSession) {
        return res.json([]); // Return empty array if no active session
      }
      const queue = await storage.getQueue(activeSession.id);
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

      // Generate multiple matchup options with different player sets
      const { allCombinations, restWarnings } = generateAllMatchupOptions(
        activeSession.id,
        queue,
        allPlayers,
        15 // Return top 15 balanced options
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

      // Calculate average skill scores for each team (stored as 0-100, so divide by 10 for calculations)
      const team1AvgSkill = team1.reduce((sum, p) => sum + (p.skillScore || 50), 0) / team1.length / 10;
      const team2AvgSkill = team2.reduce((sum, p) => sum + (p.skillScore || 50), 0) / team2.length / 10;
      
      // Calculate skill score adjustments
      // Base adjustment on skill difference and score margin
      const scoreDiff = Math.abs(team1Score - team2Score);
      const scoreMarginFactor = Math.min(scoreDiff / 10, 1.5); // Cap at 1.5x multiplier
      
      // Track skill score changes for game history
      const participantData: Array<{
        playerId: string;
        team: number;
        skillBefore: number;
        skillAfter: number;
      }> = [];
      
      for (const player of players) {
        const isWinner = winners.some(w => w.id === player.id);
        const isTeam1 = player.team === 1;
        
        const teamSkill = isTeam1 ? team1AvgSkill : team2AvgSkill;
        const opponentSkill = isTeam1 ? team2AvgSkill : team1AvgSkill;
        
        // Calculate skill change based on opponent strength
        const skillDiff = opponentSkill - teamSkill;
        let skillChange = 0;
        
        if (isWinner) {
          // Winners gain more points if they beat stronger opponents
          skillChange = 0.3 + (skillDiff * 0.1);
          skillChange *= scoreMarginFactor;
        } else {
          // Losers lose fewer points if they lost to stronger opponents
          skillChange = -0.2 - (skillDiff * 0.08);
          skillChange *= scoreMarginFactor;
        }
        
        // Clamp skill change to reasonable bounds
        skillChange = Math.max(-1.5, Math.min(1.5, skillChange));
        
        // Calculate new skill score in 0-10 scale
        const currentSkill = (player.skillScore || 50) / 10;
        const newSkill = Math.max(0, Math.min(10, currentSkill + skillChange));
        
        // Store as integer 0-100 scale (multiply by 10)
        const skillBefore = player.skillScore || 50;
        const skillAfter = Math.round(newSkill * 10);
        
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
          status: 'waiting',
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

      const courts = await storage.getCourtsBySession(activeSession.id);
      const queue = await storage.getQueue(activeSession.id);
      
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
        // Reset stats based on initial skill levels
        let initialSkillScore = 50; // Default to 5.0
        if (player.level === 'Beginner') initialSkillScore = 30; // 3.0
        if (player.level === 'Intermediate') initialSkillScore = 50; // 5.0
        if (player.level === 'Advanced') initialSkillScore = 80; // 8.0
        
        await storage.updatePlayer(player.id, {
          gamesPlayed: 0,
          wins: 0,
          skillScore: initialSkillScore,
          status: 'waiting', // Set all players back to waiting
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

  const httpServer = createServer(app);
  return httpServer;
}
