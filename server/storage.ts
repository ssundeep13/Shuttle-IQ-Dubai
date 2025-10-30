import { 
  type Player, 
  type InsertPlayer, 
  type Court, 
  type InsertCourt,
  type CourtWithPlayers,
  type CourtPlayer,
  players,
  courts,
  courtPlayers as courtPlayersTable,
  queueEntries
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

// Helper function to add computed SKID to player object
function addSkidToPlayer(player: typeof players.$inferSelect): Player {
  return {
    ...player,
    skid: Math.floor(player.skillScore / 10)
  };
}

export interface IStorage {
  // Player operations
  getPlayer(id: string): Promise<Player | undefined>;
  getAllPlayers(): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;
  
  // Court operations
  getCourt(id: string): Promise<Court | undefined>;
  getAllCourts(): Promise<Court[]>;
  createCourt(court: InsertCourt): Promise<Court>;
  updateCourt(id: string, updates: Partial<Court>): Promise<Court | undefined>;
  deleteCourt(id: string): Promise<boolean>;
  
  // Court players (many-to-many with team assignments)
  getCourtPlayers(courtId: string): Promise<string[]>;
  getCourtPlayersWithTeams(courtId: string): Promise<CourtPlayer[]>;
  setCourtPlayers(courtId: string, playerIds: string[]): Promise<void>;
  setCourtPlayersWithTeams(courtId: string, assignments: { playerId: string; team: number }[]): Promise<void>;
  
  // Queue operations
  getQueue(): Promise<string[]>;
  setQueue(playerIds: string[]): Promise<void>;
  addToQueue(playerId: string): Promise<void>;
  removeFromQueue(playerId: string): Promise<void>;
  
  // Complex queries
  getCourtsWithPlayers(): Promise<CourtWithPlayers[]>;
}

export class DatabaseStorage implements IStorage {
  // Player operations
  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player ? addSkidToPlayer(player) : undefined;
  }

  async getAllPlayers(): Promise<Player[]> {
    const playerList = await db.select().from(players);
    return playerList.map(addSkidToPlayer);
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const [player] = await db
      .insert(players)
      .values({ 
        ...insertPlayer, 
        id,
        status: insertPlayer.status || 'waiting',
        gamesPlayed: insertPlayer.gamesPlayed || 0,
        wins: insertPlayer.wins || 0
      })
      .returning();
    return addSkidToPlayer(player);
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const [updated] = await db
      .update(players)
      .set(updates)
      .where(eq(players.id, id))
      .returning();
    return updated ? addSkidToPlayer(updated) : undefined;
  }

  async deletePlayer(id: string): Promise<boolean> {
    // Delete related court players
    await db.delete(courtPlayersTable).where(eq(courtPlayersTable.playerId, id));
    
    // Delete related queue entries
    await db.delete(queueEntries).where(eq(queueEntries.playerId, id));
    
    // Delete the player
    const result = await db.delete(players).where(eq(players.id, id)).returning();
    return result.length > 0;
  }

  // Court operations
  async getCourt(id: string): Promise<Court | undefined> {
    const [court] = await db.select().from(courts).where(eq(courts.id, id));
    return court || undefined;
  }

  async getAllCourts(): Promise<Court[]> {
    return await db.select().from(courts);
  }

  async createCourt(insertCourt: InsertCourt): Promise<Court> {
    const id = randomUUID();
    const [court] = await db
      .insert(courts)
      .values({ 
        ...insertCourt, 
        id,
        status: insertCourt.status || 'available',
        timeRemaining: insertCourt.timeRemaining || 0,
        winningTeam: insertCourt.winningTeam || null
      })
      .returning();
    return court;
  }

  async updateCourt(id: string, updates: Partial<Court>): Promise<Court | undefined> {
    const [updated] = await db
      .update(courts)
      .set(updates)
      .where(eq(courts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCourt(id: string): Promise<boolean> {
    // Delete related court players
    await db.delete(courtPlayersTable).where(eq(courtPlayersTable.courtId, id));
    
    // Delete the court
    const result = await db.delete(courts).where(eq(courts.id, id)).returning();
    return result.length > 0;
  }

  // Court players operations
  async getCourtPlayers(courtId: string): Promise<string[]> {
    const playerData = await db
      .select()
      .from(courtPlayersTable)
      .where(eq(courtPlayersTable.courtId, courtId));
    return playerData.map(cp => cp.playerId);
  }

  async getCourtPlayersWithTeams(courtId: string): Promise<CourtPlayer[]> {
    return await db
      .select()
      .from(courtPlayersTable)
      .where(eq(courtPlayersTable.courtId, courtId));
  }

  async setCourtPlayers(courtId: string, playerIds: string[]): Promise<void> {
    // Legacy method - auto-assign teams
    const assignments = playerIds.map((playerId, index) => ({
      playerId,
      team: index < Math.ceil(playerIds.length / 2) ? 1 : 2
    }));
    await this.setCourtPlayersWithTeams(courtId, assignments);
  }

  async setCourtPlayersWithTeams(courtId: string, assignments: { playerId: string; team: number }[]): Promise<void> {
    // Clear existing court players
    await db.delete(courtPlayersTable).where(eq(courtPlayersTable.courtId, courtId));
    
    // Insert new assignments
    if (assignments.length > 0) {
      await db.insert(courtPlayersTable).values(
        assignments.map(a => ({
          courtId,
          playerId: a.playerId,
          team: a.team
        }))
      );
    }
  }

  // Queue operations
  async getQueue(): Promise<string[]> {
    const entries = await db
      .select()
      .from(queueEntries)
      .orderBy(desc(queueEntries.position));
    return entries.map(e => e.playerId);
  }

  async setQueue(playerIds: string[]): Promise<void> {
    // Clear existing queue
    await db.delete(queueEntries);
    
    // Insert new queue
    if (playerIds.length > 0) {
      await db.insert(queueEntries).values(
        playerIds.map((playerId, index) => ({
          id: randomUUID(),
          playerId,
          position: index
        }))
      );
    }
  }

  async addToQueue(playerId: string): Promise<void> {
    // Check if player already in queue
    const existing = await db
      .select()
      .from(queueEntries)
      .where(eq(queueEntries.playerId, playerId));
    
    if (existing.length === 0) {
      // Get max position
      const allEntries = await db.select().from(queueEntries);
      const maxPosition = allEntries.length > 0 
        ? Math.max(...allEntries.map(e => e.position)) 
        : -1;
      
      await db.insert(queueEntries).values({
        id: randomUUID(),
        playerId,
        position: maxPosition + 1
      });
    }
  }

  async removeFromQueue(playerId: string): Promise<void> {
    await db.delete(queueEntries).where(eq(queueEntries.playerId, playerId));
  }

  // Complex queries
  async getCourtsWithPlayers(): Promise<CourtWithPlayers[]> {
    const allCourts = await this.getAllCourts();
    const courtsWithPlayers: CourtWithPlayers[] = [];

    for (const court of allCourts) {
      const courtPlayerData = await this.getCourtPlayersWithTeams(court.id);
      const playersWithTeams = (await Promise.all(
        courtPlayerData.map(async cp => {
          const player = await this.getPlayer(cp.playerId);
          if (!player) return null;
          return { ...player, team: cp.team };
        })
      )).filter((p): p is Player & { team: number } => p !== null);

      courtsWithPlayers.push({
        ...court,
        players: playersWithTeams,
      });
    }

    return courtsWithPlayers;
  }
}

export const storage = new DatabaseStorage();
