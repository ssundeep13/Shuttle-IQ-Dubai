import { db } from "../db";
import { adminUsers, authSessions, type InsertAdminUser, type AdminUser, type AuthSession } from "@shared/schema";
import { eq, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { hashPassword } from "./utils";
import bcrypt from "bcryptjs";

export async function createAdminUser(data: InsertAdminUser): Promise<AdminUser> {
  const id = randomUUID();
  const [user] = await db.insert(adminUsers).values({ ...data, id }).returning();
  return user;
}

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  return user || null;
}

export async function findAdminById(id: string): Promise<AdminUser | null> {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  return user || null;
}

export async function updateAdminLastLogin(id: string): Promise<void> {
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, id));
}

export async function createAuthSession(adminUserId: string, refreshToken: string, expiresAt: Date): Promise<AuthSession> {
  const id = randomUUID();
  
  // Hash refresh token before storing
  const hashedToken = await bcrypt.hash(refreshToken, 10);
  
  const [session] = await db.insert(authSessions).values({ 
    id, 
    adminUserId, 
    refreshToken: hashedToken, 
    expiresAt 
  }).returning();
  return session;
}

export async function findAuthSession(refreshToken: string): Promise<AuthSession | null> {
  // Get all sessions for potential matching
  const sessions = await db.select().from(authSessions);
  
  // Check each session's hashed token
  for (const session of sessions) {
    const isMatch = await bcrypt.compare(refreshToken, session.refreshToken);
    if (isMatch) {
      return session;
    }
  }
  
  return null;
}

export async function deleteAuthSession(refreshToken: string): Promise<void> {
  // Find the session first (since tokens are hashed)
  const session = await findAuthSession(refreshToken);
  if (session) {
    await db.delete(authSessions).where(eq(authSessions.id, session.id));
  }
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
}

export async function seedAdminUser(): Promise<AdminUser | null> {
  // Only seed in development mode
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  // Create default admin user
  const existingDefaultAdmin = await findAdminByEmail('admin@shuttleiq.com');
  if (!existingDefaultAdmin) {
    const defaultPasswordHash = await hashPassword('admin123');
    await createAdminUser({
      email: 'admin@shuttleiq.com',
      passwordHash: defaultPasswordHash,
      role: 'admin',
    });
    console.log('[SEED] Created default admin user (development only)');
  }

  // Create user's personal admin account
  const existingUserAdmin = await findAdminByEmail('ssundeep13@gmail.com');
  if (!existingUserAdmin) {
    const userPasswordHash = await hashPassword('shuttleiqdubai');
    const userAdmin = await createAdminUser({
      email: 'ssundeep13@gmail.com',
      passwordHash: userPasswordHash,
      role: 'super_admin',
    });
    console.log('[SEED] Created user admin account (development only)');
    return userAdmin;
  }

  return null;
}
