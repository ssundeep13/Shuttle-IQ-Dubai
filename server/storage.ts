import { 
  type Player, 
  type InsertPlayer, 
  type Court, 
  type InsertCourt,
  type CourtWithPlayers,
  type CourtPlayer,
  type Session,
  type InsertSession,
  type GameParticipant,
  players,
  courts,
  courtPlayers as courtPlayersTable,
  queueEntries,
  sessions,
  gameResults,
  gameParticipants
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { clearSessionRestStates } from "./matchmaking";

// Helper function to add computed SKID to player object
function addSkidToPlayer(player: typeof players.$inferSelect): Player {
  return {
    ...player,
    skid: Math.floor(player.skillScore / 10)
  };
}

export interface IStorage {
  // Session operations
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  getActiveSession(): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  endSession(id: string): Promise<Session | undefined>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
  
  // Player operations (global)
  getPlayer(id: string): Promise<Player | undefined>;
  getPlayerByExternalId(externalId: string): Promise<Player | undefined>;
  getAllPlayers(): Promise<Player[]>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;
  
  // Court operations (session-specific)
  getCourt(id: string): Promise<Court | undefined>;
  getCourtsBySession(sessionId: string): Promise<Court[]>;
  createCourt(court: InsertCourt): Promise<Court>;
  updateCourt(id: string, updates: Partial<Court>): Promise<Court | undefined>;
  deleteCourt(id: string): Promise<boolean>;
  
  // Court players (many-to-many with team assignments)
  getCourtPlayers(courtId: string): Promise<string[]>;
  getCourtPlayersWithTeams(courtId: string): Promise<CourtPlayer[]>;
  setCourtPlayers(courtId: string, playerIds: string[]): Promise<void>;
  setCourtPlayersWithTeams(courtId: string, assignments: { playerId: string; team: number }[]): Promise<void>;
  
  // Queue operations (session-specific)
  getQueue(sessionId: string): Promise<string[]>;
  setQueue(sessionId: string, playerIds: string[]): Promise<void>;
  addToQueue(sessionId: string, playerId: string): Promise<void>;
  removeFromQueue(sessionId: string, playerId: string): Promise<void>;
  
  // Complex queries
  getCourtsWithPlayers(sessionId: string): Promise<CourtWithPlayers[]>;
  getSessionGameHistory(sessionId: string): Promise<any[]>;
  getSessionGameParticipants(sessionId: string): Promise<(GameParticipant & { createdAt: Date })[]>;
}

export class DatabaseStorage implements IStorage {
  // Session operations
  async createSession(insertSession: InsertSession): Promise<Session> {
    // Allow multiple concurrent sessions (removed auto-ending logic)
    // Default to 'active' status to preserve existing workflow
    const id = randomUUID();
    const status = insertSession.status || 'active';
    
    // Set endedAt timestamp if creating an ended session
    const endedAt = status === 'ended' ? new Date() : undefined;
    
    const [session] = await db
      .insert(sessions)
      .values({ 
        ...insertSession,
        ...(endedAt && { endedAt }),
        id,
        status
      })
      .returning();
    
    // Create courts for the new session
    const courtsToCreate = insertSession.courtCount || 2;
    for (let i = 1; i <= courtsToCreate; i++) {
      await this.createCourt({
        name: `Court ${i}`,
        sessionId: session.id,
        status: 'available',
        timeRemaining: 0,
        winningTeam: null,
        startedAt: null
      });
    }

    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getActiveSession(): Promise<Session | undefined> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.status, 'active'))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    return session || undefined;
  }

  async getAllSessions(): Promise<Session[]> {
    return await db.select().from(sessions).orderBy(desc(sessions.createdAt));
  }

  async endSession(id: string): Promise<Session | undefined> {
    const [session] = await db
      .update(sessions)
      .set({ status: 'ended', endedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    const [session] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    // Clear matchmaking rest states for this session
    clearSessionRestStates(id);
    
    // Delete all related data first (cascade delete)
    // Get all courts for this session FIRST before any deletions
    const sessionCourts = await this.getCourtsBySession(id);
    
    // Collect all game IDs before deleting anything
    const allGameIds: string[] = [];
    for (const court of sessionCourts) {
      const courtGames = await db
        .select()
        .from(gameResults)
        .where(eq(gameResults.courtId, court.id));
      allGameIds.push(...courtGames.map(g => g.id));
    }
    
    // 1. Delete game participants for all collected games
    if (allGameIds.length > 0) {
      await db.delete(gameParticipants).where(inArray(gameParticipants.gameId, allGameIds));
    }
    
    // 2. Delete game results for all courts in this session
    for (const court of sessionCourts) {
      await db.delete(gameResults).where(eq(gameResults.courtId, court.id));
    }
    
    // 3. Delete court players for all courts in this session
    for (const court of sessionCourts) {
      await db.delete(courtPlayersTable).where(eq(courtPlayersTable.courtId, court.id));
    }
    
    // 4. Delete courts
    await db.delete(courts).where(eq(courts.sessionId, id));
    
    // 5. Delete queue entries
    await db.delete(queueEntries).where(eq(queueEntries.sessionId, id));
    
    // 6. Finally delete the session
    const result = await db.delete(sessions).where(eq(sessions.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Player operations
  async getPlayer(id: string): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player ? addSkidToPlayer(player) : undefined;
  }

  async getPlayerByExternalId(externalId: string): Promise<Player | undefined> {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.externalId, externalId));
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

  async getCourtsBySession(sessionId: string): Promise<Court[]> {
    return await db.select().from(courts).where(eq(courts.sessionId, sessionId));
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

  // Queue operations (session-specific)
  async getQueue(sessionId: string): Promise<string[]> {
    const entries = await db
      .select()
      .from(queueEntries)
      .where(eq(queueEntries.sessionId, sessionId))
      .orderBy(queueEntries.position); // Ascending order - first in queue has lowest position
    return entries.map(e => e.playerId);
  }

  async setQueue(sessionId: string, playerIds: string[]): Promise<void> {
    // Clear existing queue for this session
    await db.delete(queueEntries).where(eq(queueEntries.sessionId, sessionId));
    
    // Insert new queue
    if (playerIds.length > 0) {
      await db.insert(queueEntries).values(
        playerIds.map((playerId, index) => ({
          id: randomUUID(),
          sessionId,
          playerId,
          position: index
        }))
      );
    }
  }

  async addToQueue(sessionId: string, playerId: string): Promise<void> {
    // Check if player already in queue for this session
    const existing = await db
      .select()
      .from(queueEntries)
      .where(and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.playerId, playerId)
      ));
    
    if (existing.length === 0) {
      // Get max position for this session
      const allEntries = await db
        .select()
        .from(queueEntries)
        .where(eq(queueEntries.sessionId, sessionId));
      const maxPosition = allEntries.length > 0 
        ? Math.max(...allEntries.map(e => e.position)) 
        : -1;
      
      await db.insert(queueEntries).values({
        id: randomUUID(),
        sessionId,
        playerId,
        position: maxPosition + 1
      });
    }
  }

  async removeFromQueue(sessionId: string, playerId: string): Promise<void> {
    await db.delete(queueEntries).where(
      and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.playerId, playerId)
      )
    );
  }

  // Complex queries
  async getCourtsWithPlayers(sessionId: string): Promise<CourtWithPlayers[]> {
    const allCourts = await this.getCourtsBySession(sessionId);
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

  async getSessionGameHistory(sessionId: string): Promise<any[]> {
    const games = await db
      .select()
      .from(gameResults)
      .where(eq(gameResults.sessionId, sessionId))
      .orderBy(desc(gameResults.createdAt));
    
    return games;
  }

  async getSessionGameParticipants(sessionId: string): Promise<(GameParticipant & { createdAt: Date })[]> {
    // Join game participants with game results to get session ID and createdAt
    const participants = await db
      .select({
        gameId: gameParticipants.gameId,
        playerId: gameParticipants.playerId,
        team: gameParticipants.team,
        skillScoreBefore: gameParticipants.skillScoreBefore,
        skillScoreAfter: gameParticipants.skillScoreAfter,
        createdAt: gameResults.createdAt,
      })
      .from(gameParticipants)
      .innerJoin(gameResults, eq(gameParticipants.gameId, gameResults.id))
      .where(eq(gameResults.sessionId, sessionId))
      .orderBy(desc(gameResults.createdAt));
    
    return participants;
  }
}

export const storage = new DatabaseStorage();
