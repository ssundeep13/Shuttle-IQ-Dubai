import { 
  type Player, 
  type InsertPlayer, 
  type Court, 
  type InsertCourt,
  type CourtWithPlayers 
} from "@shared/schema";
import { randomUUID } from "crypto";

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
  
  // Court players (many-to-many)
  getCourtPlayers(courtId: string): Promise<string[]>;
  setCourtPlayers(courtId: string, playerIds: string[]): Promise<void>;
  
  // Queue operations
  getQueue(): Promise<string[]>;
  setQueue(playerIds: string[]): Promise<void>;
  addToQueue(playerId: string): Promise<void>;
  removeFromQueue(playerId: string): Promise<void>;
  
  // Complex queries
  getCourtsWithPlayers(): Promise<CourtWithPlayers[]>;
}

export class MemStorage implements IStorage {
  private players: Map<string, Player>;
  private courts: Map<string, Court>;
  private courtPlayers: Map<string, string[]>; // courtId -> playerIds
  private queue: string[]; // ordered player IDs

  constructor() {
    this.players = new Map();
    this.courts = new Map();
    this.courtPlayers = new Map();
    this.queue = [];
    
    // Initialize with sample data
    this.initializeSampleData();
  }

  private async initializeSampleData() {
    // Add initial players
    const initialPlayers: InsertPlayer[] = [
      { name: 'Hari', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Aditya', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Jino', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Arjun', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Sourabh', level: 'Advanced', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Marium', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Kush', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'AJ', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Cinto John', level: 'Advanced', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Mohini', level: 'Beginner', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Akhila', level: 'Beginner', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Archie', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Amal Raj', level: 'Advanced', gamesPlayed: 0, wins: 0, status: 'waiting' },
      { name: 'Sandeep', level: 'Intermediate', gamesPlayed: 0, wins: 0, status: 'waiting' },
    ];

    for (const player of initialPlayers) {
      const created = await this.createPlayer(player);
      this.queue.push(created.id);
    }

    // Add initial courts
    const initialCourts: InsertCourt[] = [
      { name: 'Court 1', status: 'available', timeRemaining: 0, winningTeam: null },
      { name: 'Court 2', status: 'available', timeRemaining: 0, winningTeam: null },
      { name: 'Court 3', status: 'available', timeRemaining: 0, winningTeam: null },
      { name: 'Court 4', status: 'available', timeRemaining: 0, winningTeam: null },
    ];

    for (const court of initialCourts) {
      await this.createCourt(court);
    }
  }

  // Player operations
  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async getAllPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const player: Player = { ...insertPlayer, id };
    this.players.set(id, player);
    return player;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const player = this.players.get(id);
    if (!player) return undefined;
    
    const updated: Player = { ...player, ...updates, id };
    this.players.set(id, updated);
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    return this.players.delete(id);
  }

  // Court operations
  async getCourt(id: string): Promise<Court | undefined> {
    return this.courts.get(id);
  }

  async getAllCourts(): Promise<Court[]> {
    return Array.from(this.courts.values());
  }

  async createCourt(insertCourt: InsertCourt): Promise<Court> {
    const id = randomUUID();
    const court: Court = { ...insertCourt, id };
    this.courts.set(id, court);
    this.courtPlayers.set(id, []);
    return court;
  }

  async updateCourt(id: string, updates: Partial<Court>): Promise<Court | undefined> {
    const court = this.courts.get(id);
    if (!court) return undefined;
    
    const updated: Court = { ...court, ...updates, id };
    this.courts.set(id, updated);
    return updated;
  }

  async deleteCourt(id: string): Promise<boolean> {
    const deleted = this.courts.delete(id);
    if (deleted) {
      this.courtPlayers.delete(id);
    }
    return deleted;
  }

  // Court players operations
  async getCourtPlayers(courtId: string): Promise<string[]> {
    return this.courtPlayers.get(courtId) || [];
  }

  async setCourtPlayers(courtId: string, playerIds: string[]): Promise<void> {
    this.courtPlayers.set(courtId, playerIds);
  }

  // Queue operations
  async getQueue(): Promise<string[]> {
    return [...this.queue];
  }

  async setQueue(playerIds: string[]): Promise<void> {
    this.queue = [...playerIds];
  }

  async addToQueue(playerId: string): Promise<void> {
    if (!this.queue.includes(playerId)) {
      this.queue.push(playerId);
    }
  }

  async removeFromQueue(playerId: string): Promise<void> {
    this.queue = this.queue.filter(id => id !== playerId);
  }

  // Complex queries
  async getCourtsWithPlayers(): Promise<CourtWithPlayers[]> {
    const courts = await this.getAllCourts();
    const courtsWithPlayers: CourtWithPlayers[] = [];

    for (const court of courts) {
      const playerIds = await this.getCourtPlayers(court.id);
      const players = (await Promise.all(
        playerIds.map(id => this.getPlayer(id))
      )).filter((p): p is Player => p !== undefined);

      courtsWithPlayers.push({
        ...court,
        players,
      });
    }

    return courtsWithPlayers;
  }
}

export const storage = new MemStorage();
