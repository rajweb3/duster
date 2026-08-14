import { randomBytes } from 'crypto';
import type { User, Tenant } from './types.js';
import { hashPassword, verifyPassword } from './password.js';

export interface UserRecord {
  user: User;
  passwordHash: string;
}

export interface UserStore {
  createUser(email: string, password: string, name: string, tenantId: string, role: User['role']): UserRecord;
  findByEmail(email: string): UserRecord | undefined;
  findById(id: string): UserRecord | undefined;
  authenticate(email: string, password: string): User | null;
  updateLastLogin(userId: string): void;
}

export interface TenantStore {
  create(name: string): Tenant;
  findById(id: string): Tenant | undefined;
  updateStatus(id: string, status: Tenant['status']): void;
  setInstanceId(id: string, instanceId: string): void;
}

export function createUserStore(): UserStore {
  const users = new Map<string, UserRecord>();
  const emailIndex = new Map<string, string>();

  return {
    createUser(email: string, password: string, name: string, tenantId: string, role: User['role']): UserRecord {
      const id = randomBytes(16).toString('hex');
      const now = Date.now();
      const user: User = { id, email, name, tenantId, role, createdAt: now, lastLoginAt: now };
      const record: UserRecord = { user, passwordHash: hashPassword(password) };
      users.set(id, record);
      emailIndex.set(email.toLowerCase(), id);
      return record;
    },

    findByEmail(email: string): UserRecord | undefined {
      const id = emailIndex.get(email.toLowerCase());
      if (!id) return undefined;
      return users.get(id);
    },

    findById(id: string): UserRecord | undefined {
      return users.get(id);
    },

    authenticate(email: string, password: string): User | null {
      const record = this.findByEmail(email);
      if (!record) return null;
      if (!verifyPassword(password, record.passwordHash)) return null;
      this.updateLastLogin(record.user.id);
      return record.user;
    },

    updateLastLogin(userId: string): void {
      const record = users.get(userId);
      if (record) {
        record.user = { ...record.user, lastLoginAt: Date.now() };
        users.set(userId, record);
      }
    },
  };
}

export function createTenantStore(): TenantStore {
  const tenants = new Map<string, Tenant>();

  return {
    create(name: string): Tenant {
      const id = `tenant-${randomBytes(8).toString('hex')}`;
      const tenant: Tenant = { id, name, plan: 'standard', status: 'provisioning', createdAt: Date.now() };
      tenants.set(id, tenant);
      return tenant;
    },

    findById(id: string): Tenant | undefined {
      return tenants.get(id);
    },

    updateStatus(id: string, status: Tenant['status']): void {
      const tenant = tenants.get(id);
      if (tenant) {
        tenants.set(id, { ...tenant, status });
      }
    },

    setInstanceId(id: string, instanceId: string): void {
      const tenant = tenants.get(id);
      if (tenant) {
        tenants.set(id, { ...tenant, instanceId, provisionedAt: Date.now() });
      }
    },
  };
}
