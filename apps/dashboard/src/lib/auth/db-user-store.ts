import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, tenants } from '@/db/schema';
import type { User, Tenant } from './types.js';
import type { UserStore, UserRecord, TenantStore } from './user-store.js';
import { hashPassword, verifyPassword } from './password.js';

export function createDbUserStore(): UserStore {
  return {
    createUser(email: string, password: string, name: string, tenantId: string, role: User['role']): UserRecord {
      throw new Error('Use createDbUserStoreAsync().createUser() instead — DB operations are async');
    },

    findByEmail(_email: string): UserRecord | undefined {
      throw new Error('Use createDbUserStoreAsync().findByEmail() instead — DB operations are async');
    },

    findById(_id: string): UserRecord | undefined {
      throw new Error('Use createDbUserStoreAsync().findById() instead — DB operations are async');
    },

    authenticate(_email: string, _password: string): User | null {
      throw new Error('Use createDbUserStoreAsync().authenticate() instead — DB operations are async');
    },

    updateLastLogin(_userId: string): void {
      throw new Error('Use createDbUserStoreAsync().updateLastLogin() instead — DB operations are async');
    },
  };
}

export interface AsyncUserStore {
  createUser(email: string, password: string, name: string, tenantId: string, role: User['role']): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<UserRecord | undefined>;
  authenticate(email: string, password: string): Promise<User | null>;
  updateLastLogin(userId: string): Promise<void>;
}

export interface AsyncTenantStore {
  create(name: string): Promise<Tenant>;
  findById(id: string): Promise<Tenant | undefined>;
  updateStatus(id: string, status: Tenant['status']): Promise<void>;
  setInstanceId(id: string, instanceId: string): Promise<void>;
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

function rowToTenant(row: typeof tenants.$inferSelect): Tenant {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    status: row.status,
    instanceId: row.instanceId || undefined,
    createdAt: row.createdAt.getTime(),
    provisionedAt: row.provisionedAt?.getTime(),
  };
}

export function createDbUserStoreAsync(): AsyncUserStore {
  return {
    async createUser(email, password, name, tenantId, role): Promise<UserRecord> {
      const passwordHash = hashPassword(password);
      const [row] = await db.insert(users).values({
        email,
        name,
        passwordHash,
        tenantId,
        role,
      }).returning();

      return { user: rowToUser(row), passwordHash };
    },

    async findByEmail(email): Promise<UserRecord | undefined> {
      const row = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, email.toLowerCase()),
      });
      if (!row) return undefined;
      return { user: rowToUser(row), passwordHash: row.passwordHash };
    },

    async findById(id): Promise<UserRecord | undefined> {
      const row = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, id),
      });
      if (!row) return undefined;
      return { user: rowToUser(row), passwordHash: row.passwordHash };
    },

    async authenticate(email, password): Promise<User | null> {
      const record = await this.findByEmail(email);
      if (!record) return null;
      if (!verifyPassword(password, record.passwordHash)) return null;
      await this.updateLastLogin(record.user.id);
      return record.user;
    },

    async updateLastLogin(userId): Promise<void> {
      await db.update(users).set({
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, userId));
    },
  };
}

export function createDbTenantStoreAsync(): AsyncTenantStore {
  return {
    async create(name): Promise<Tenant> {
      const [row] = await db.insert(tenants).values({
        name,
      }).returning();
      return rowToTenant(row);
    },

    async findById(id): Promise<Tenant | undefined> {
      const row = await db.query.tenants.findFirst({
        where: (t, { eq }) => eq(t.id, id),
      });
      if (!row) return undefined;
      return rowToTenant(row);
    },

    async updateStatus(id, status): Promise<void> {
      await db.update(tenants).set({
        status,
        updatedAt: new Date(),
      }).where(eq(tenants.id, id));
    },

    async setInstanceId(id, instanceId): Promise<void> {
      await db.update(tenants).set({
        instanceId,
        provisionedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(tenants.id, id));
    },
  };
}
