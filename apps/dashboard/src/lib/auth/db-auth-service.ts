import { eq, lt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '@/db';
import { users, tenants, sessions } from '@/db/schema';
import type { User, Tenant, Session, SignupRequest, LoginRequest, AuthResult } from './types.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DbAuthService {
  signup(request: SignupRequest): Promise<AuthResult>;
  login(request: LoginRequest): Promise<AuthResult>;
  logout(token: string): Promise<void>;
  validateSession(token: string): Promise<AuthResult>;
  cleanupExpiredSessions(): Promise<number>;
}

function rowToUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tenantId: row.tenantId,
    role: row.role,
    createdAt: row.createdAt.getTime(),
    lastLoginAt: row.lastLoginAt?.getTime() || row.createdAt.getTime(),
  };
}

export function createDbAuthService(): DbAuthService {
  return {
    async signup(request: SignupRequest): Promise<AuthResult> {
      const { email, password, name, teamName } = request;

      if (!email || !email.includes('@')) {
        return { success: false, error: 'Invalid email address' };
      }

      const existing = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, email.toLowerCase()),
      });
      if (existing) {
        return { success: false, error: 'Email already registered' };
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return { success: false, error: strength.reason };
      }

      const [tenant] = await db.insert(tenants).values({
        name: teamName,
      }).returning();

      const passwordHash = hashPassword(password);
      const [userRow] = await db.insert(users).values({
        email: email.toLowerCase(),
        name,
        passwordHash,
        tenantId: tenant.id,
        role: 'owner',
      }).returning();

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      const [sessionRow] = await db.insert(sessions).values({
        userId: userRow.id,
        tenantId: tenant.id,
        token,
        expiresAt,
      }).returning();

      const user = rowToUser(userRow);
      const session: Session = {
        userId: sessionRow.userId,
        tenantId: sessionRow.tenantId,
        token: sessionRow.token,
        expiresAt: sessionRow.expiresAt.getTime(),
      };

      return { success: true, user, session };
    },

    async login(request: LoginRequest): Promise<AuthResult> {
      const { email, password } = request;

      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      const userRow = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, email.toLowerCase()),
      });

      if (!userRow) {
        return { success: false, error: 'Invalid email or password' };
      }

      if (!verifyPassword(password, userRow.passwordHash)) {
        return { success: false, error: 'Invalid email or password' };
      }

      await db.update(users).set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, userRow.id));

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      const [sessionRow] = await db.insert(sessions).values({
        userId: userRow.id,
        tenantId: userRow.tenantId,
        token,
        expiresAt,
      }).returning();

      const user = rowToUser({ ...userRow, lastLoginAt: new Date() });
      const session: Session = {
        userId: sessionRow.userId,
        tenantId: sessionRow.tenantId,
        token: sessionRow.token,
        expiresAt: sessionRow.expiresAt.getTime(),
      };

      return { success: true, user, session };
    },

    async logout(token: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.token, token));
    },

    async validateSession(token: string): Promise<AuthResult> {
      const sessionRow = await db.query.sessions.findFirst({
        where: (s, { eq, and, gt }) => and(
          eq(s.token, token),
          gt(s.expiresAt, new Date()),
        ),
      });

      if (!sessionRow) {
        return { success: false, error: 'Invalid or expired session' };
      }

      const userRow = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, sessionRow.userId),
      });

      if (!userRow) {
        await db.delete(sessions).where(eq(sessions.token, token));
        return { success: false, error: 'User not found' };
      }

      const user = rowToUser(userRow);
      const session: Session = {
        userId: sessionRow.userId,
        tenantId: sessionRow.tenantId,
        token: sessionRow.token,
        expiresAt: sessionRow.expiresAt.getTime(),
      };

      return { success: true, user, session };
    },

    async cleanupExpiredSessions(): Promise<number> {
      const result = await db.delete(sessions)
        .where(lt(sessions.expiresAt, new Date()))
        .returning();
      return result.length;
    },
  };
}
