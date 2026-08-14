import { randomBytes } from 'crypto';
import type { Session } from './types.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SessionStore {
  get(token: string): Session | undefined;
  set(session: Session): void;
  delete(token: string): void;
  getByUserId(userId: string): Session[];
  cleanup(): number;
}

export function createSessionStore(): SessionStore {
  const sessions = new Map<string, Session>();

  return {
    get(token: string): Session | undefined {
      const session = sessions.get(token);
      if (!session) return undefined;
      if (Date.now() > session.expiresAt) {
        sessions.delete(token);
        return undefined;
      }
      return session;
    },

    set(session: Session): void {
      sessions.set(session.token, session);
    },

    delete(token: string): void {
      sessions.delete(token);
    },

    getByUserId(userId: string): Session[] {
      const result: Session[] = [];
      for (const session of sessions.values()) {
        if (session.userId === userId && Date.now() <= session.expiresAt) {
          result.push(session);
        }
      }
      return result;
    },

    cleanup(): number {
      const now = Date.now();
      let removed = 0;
      for (const [token, session] of sessions.entries()) {
        if (now > session.expiresAt) {
          sessions.delete(token);
          removed++;
        }
      }
      return removed;
    },
  };
}

export function createSession(userId: string, tenantId: string): Session {
  return {
    userId,
    tenantId,
    token: randomBytes(32).toString('hex'),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}
