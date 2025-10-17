import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema } from "@shared/schema";
import { z } from "zod";

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
      const { playerIds } = req.body;
      if (!Array.isArray(playerIds) || playerIds.length < 2) {
        return res.status(400).json({ error: "At least 2 players required" });
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

      // Set court players
      await storage.setCourtPlayers(court.id, playerIds);

      // Update player statuses
      for (const playerId of playerIds) {
        await storage.updatePlayer(playerId, { status: 'playing' });
      }

      // Remove from queue
      const currentQueue = await storage.getQueue();
      const newQueue = currentQueue.filter(id => !playerIds.includes(id));
      await storage.setQueue(newQueue);

      const updatedCourt = await storage.getCourt(court.id);
      const players = (await Promise.all(
        playerIds.map(id => storage.getPlayer(id))
      )).filter(p => p !== undefined);

      res.json({ ...updatedCourt, players });
    } catch (error) {
      res.status(500).json({ error: "Failed to assign players" });
    }
  });

  app.post("/api/courts/:courtId/end-game", async (req, res) => {
    try {
      const { winningTeam } = req.body;
      if (winningTeam !== 1 && winningTeam !== 2) {
        return res.status(400).json({ error: "winningTeam must be 1 or 2" });
      }

      const court = await storage.getCourt(req.params.courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      if (court.status !== 'occupied') {
        return res.status(400).json({ error: "Court is not occupied" });
      }

      const playerIds = await storage.getCourtPlayers(court.id);
      const players = (await Promise.all(
        playerIds.map(id => storage.getPlayer(id))
      )).filter(p => p !== undefined);

      // Determine winners and losers
      const midpoint = Math.ceil(players.length / 2);
      const team1 = players.slice(0, midpoint);
      const team2 = players.slice(midpoint);
      const winners = winningTeam === 1 ? team1 : team2;
      const losers = winningTeam === 1 ? team2 : team1;

      // Update player stats
      for (const player of players) {
        const isWinner = winners.some(w => w.id === player.id);
        await storage.updatePlayer(player.id, {
          gamesPlayed: player.gamesPlayed + 1,
          wins: isWinner ? player.wins + 1 : player.wins,
          status: 'waiting',
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

  const httpServer = createServer(app);
  return httpServer;
}
