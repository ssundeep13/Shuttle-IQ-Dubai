import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, gameResults, gameParticipants } from "@shared/schema";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "./db";

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.post("/api/players", async (req, res) => {
    try {
      const validated = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(validated);
      await storage.addToQueue(player.id);
      res.status(201).json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid player data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create player" });
    }
  });

  app.patch("/api/players/:id", async (req, res) => {
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

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePlayer(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Player not found" });
      }
      await storage.removeFromQueue(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete player" });
    }
  });

  app.post("/api/players/import", async (req, res) => {
    try {
      // Validate request body
      const requestSchema = z.object({
        url: z.string().url().optional()
      });
      
      const validated = requestSchema.parse(req.body);
      const externalUrl = validated.url || "https://shuttleiq.ssundeep13.repl.co/api/players";
      
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

      // Import each player
      const importedPlayers = [];
      const skippedPlayers = [];
      
      for (const externalPlayer of externalPlayers) {
        try {
          // Validate and create player
          const playerData = {
            name: externalPlayer.name,
            level: externalPlayer.level || 'Beginner',
            gamesPlayed: externalPlayer.gamesPlayed || 0,
            wins: externalPlayer.wins || 0,
            status: 'waiting'
          };
          
          const validated = insertPlayerSchema.parse(playerData);
          const player = await storage.createPlayer(validated);
          await storage.addToQueue(player.id);
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
        imported: importedPlayers.length,
        skipped: skippedPlayers.length,
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
      const courts = await storage.getCourtsWithPlayers();
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

  app.post("/api/courts", async (req, res) => {
    try {
      const courtData = {
        name: req.body.name,
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

  app.patch("/api/courts/:id", async (req, res) => {
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

  app.delete("/api/courts/:id", async (req, res) => {
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
      const queue = await storage.getQueue();
      res.json(queue);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  app.put("/api/queue", async (req, res) => {
    try {
      const { playerIds } = req.body;
      if (!Array.isArray(playerIds)) {
        return res.status(400).json({ error: "playerIds must be an array" });
      }
      await storage.setQueue(playerIds);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update queue" });
    }
  });

  app.post("/api/queue/:playerId", async (req, res) => {
    try {
      await storage.addToQueue(req.params.playerId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to add to queue" });
    }
  });

  app.delete("/api/queue/:playerId", async (req, res) => {
    try {
      await storage.removeFromQueue(req.params.playerId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove from queue" });
    }
  });

  // Game management routes
  app.post("/api/courts/:courtId/assign", async (req, res) => {
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
      });

      // Set court players with team assignments
      await storage.setCourtPlayersWithTeams(court.id, assignments);

      // Update player statuses
      for (const assignment of assignments) {
        await storage.updatePlayer(assignment.playerId, { status: 'playing' });
      }

      // Remove from queue
      const currentQueue = await storage.getQueue();
      const assignedPlayerIds = assignments.map(a => a.playerId);
      const newQueue = currentQueue.filter(id => !assignedPlayerIds.includes(id));
      await storage.setQueue(newQueue);

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

  app.post("/api/courts/:courtId/end-game", async (req, res) => {
    try {
      const { winningTeam, team1Score, team2Score } = req.body;
      
      // Validate input
      if (winningTeam !== 1 && winningTeam !== 2) {
        return res.status(400).json({ error: "winningTeam must be 1 or 2" });
      }
      if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
        return res.status(400).json({ error: "team1Score and team2Score are required" });
      }
      if (team1Score < 0 || team2Score < 0) {
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
        return res.status(400).json({ 
          error: `Invalid team configuration. Each team must have exactly 2 players. Team 1: ${team1.length}, Team 2: ${team2.length}` 
        });
      }
      
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

      // Save game result
      const gameId = randomUUID();
      await db.insert(gameResults).values({
        id: gameId,
        courtId: court.id,
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

      // Add players back to queue (losers first, then winners)
      const currentQueue = await storage.getQueue();
      const newQueue = [
        ...currentQueue,
        ...losers.map(p => p.id),
        ...winners.map(p => p.id),
      ];
      await storage.setQueue(newQueue);

      // Reset court
      await storage.updateCourt(court.id, {
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
      });
      await storage.setCourtPlayers(court.id, []);

      const updatedCourt = await storage.getCourt(court.id);
      res.json({ ...updatedCourt, players: [] });
    } catch (error) {
      res.status(500).json({ error: "Failed to end game" });
    }
  });

  // Stats endpoint
  app.get("/api/stats", async (req, res) => {
    try {
      const players = await storage.getAllPlayers();
      const courts = await storage.getAllCourts();
      const queue = await storage.getQueue();

      const stats = {
        activePlayers: players.filter(p => p.status === 'playing').length,
        inQueue: queue.length,
        availableCourts: courts.filter(c => c.status === 'available').length,
        occupiedCourts: courts.filter(c => c.status === 'occupied').length,
        totalPlayers: players.length,
        totalCourts: courts.length,
      };

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Game History endpoint
  app.get("/api/game-history", async (req, res) => {
    try {
      const { eq } = await import('drizzle-orm');
      const { players } = await import('@shared/schema');
      
      // Fetch all game results ordered by most recent first
      const games = await db.select().from(gameResults).orderBy(gameResults.createdAt);
      
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
      
      // Sort by most recent first
      gamesWithDetails.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
