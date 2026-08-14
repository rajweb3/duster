import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordStrength } from './password.js';
import { createSessionStore, createSession } from './session.js';
import { createUserStore, createTenantStore } from './user-store.js';
import { createAuthService } from './auth-service.js';
import type { SessionStore } from './session.js';
import type { UserStore, TenantStore } from './user-store.js';
import type { AuthService } from './auth-service.js';

describe('password', () => {
  it('hashes and verifies correctly', () => {
    const hash = hashPassword('MyP@ss1234');
    expect(hash).toContain(':');
    expect(verifyPassword('MyP@ss1234', hash)).toBe(true);
  });

  it('rejects wrong password', () => {
    const hash = hashPassword('MyP@ss1234');
    expect(verifyPassword('WrongPass1', hash)).toBe(false);
  });

  it('produces different hashes for same password (salt)', () => {
    const h1 = hashPassword('Same1Pass');
    const h2 = hashPassword('Same1Pass');
    expect(h1).not.toBe(h2);
  });

  it('rejects malformed stored hash', () => {
    expect(verifyPassword('test', 'nocolon')).toBe(false);
    expect(verifyPassword('test', '')).toBe(false);
  });
});

describe('validatePasswordStrength', () => {
  it('accepts valid password', () => {
    expect(validatePasswordStrength('MyPass123')).toEqual({ valid: true });
  });

  it('rejects short password', () => {
    const r = validatePasswordStrength('Ab1');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('8 characters');
  });

  it('rejects too long password', () => {
    const r = validatePasswordStrength('A1b' + 'x'.repeat(130));
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('128');
  });

  it('rejects no uppercase', () => {
    const r = validatePasswordStrength('mypass123');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('uppercase');
  });

  it('rejects no lowercase', () => {
    const r = validatePasswordStrength('MYPASS123');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('lowercase');
  });

  it('rejects no number', () => {
    const r = validatePasswordStrength('MyPassWord');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('number');
  });
});

describe('sessionStore', () => {
  let store: ReturnType<typeof createSessionStore>;

  beforeEach(() => {
    store = createSessionStore();
  });

  it('stores and retrieves session', () => {
    const session = createSession('user-1', 'tenant-1');
    store.set(session);
    const retrieved = store.get(session.token);
    expect(retrieved).toEqual(session);
  });

  it('returns undefined for unknown token', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('deletes session', () => {
    const session = createSession('user-1', 'tenant-1');
    store.set(session);
    store.delete(session.token);
    expect(store.get(session.token)).toBeUndefined();
  });

  it('expires old sessions', () => {
    const session = createSession('user-1', 'tenant-1');
    (session as any).expiresAt = Date.now() - 1000;
    store.set(session);
    expect(store.get(session.token)).toBeUndefined();
  });

  it('finds sessions by userId', () => {
    const s1 = createSession('user-1', 'tenant-1');
    const s2 = createSession('user-1', 'tenant-1');
    const s3 = createSession('user-2', 'tenant-1');
    store.set(s1);
    store.set(s2);
    store.set(s3);
    const found = store.getByUserId('user-1');
    expect(found).toHaveLength(2);
  });

  it('cleanup removes expired sessions', () => {
    const active = createSession('user-1', 'tenant-1');
    const expired = createSession('user-2', 'tenant-1');
    (expired as any).expiresAt = Date.now() - 1000;
    store.set(active);
    store.set(expired);
    const removed = store.cleanup();
    expect(removed).toBe(1);
    expect(store.get(active.token)).toBeDefined();
    expect(store.get(expired.token)).toBeUndefined();
  });
});

describe('userStore', () => {
  let store: ReturnType<typeof createUserStore>;

  beforeEach(() => {
    store = createUserStore();
  });

  it('creates user with hashed password', () => {
    const record = store.createUser('test@example.com', 'MyPass123', 'Test', 'tenant-1', 'owner');
    expect(record.user.email).toBe('test@example.com');
    expect(record.user.role).toBe('owner');
    expect(record.passwordHash).toContain(':');
  });

  it('finds user by email (case insensitive)', () => {
    store.createUser('Test@Example.com', 'MyPass123', 'Test', 'tenant-1', 'owner');
    const found = store.findByEmail('test@example.com');
    expect(found?.user.email).toBe('Test@Example.com');
  });

  it('finds user by id', () => {
    const record = store.createUser('a@b.com', 'MyPass123', 'A', 'tenant-1', 'member');
    const found = store.findById(record.user.id);
    expect(found?.user.name).toBe('A');
  });

  it('authenticates valid credentials', () => {
    store.createUser('auth@test.com', 'Valid1Pass', 'Auth', 'tenant-1', 'admin');
    const user = store.authenticate('auth@test.com', 'Valid1Pass');
    expect(user).not.toBeNull();
    expect(user?.email).toBe('auth@test.com');
  });

  it('rejects invalid password', () => {
    store.createUser('auth@test.com', 'Valid1Pass', 'Auth', 'tenant-1', 'admin');
    const user = store.authenticate('auth@test.com', 'Wrong1Pass');
    expect(user).toBeNull();
  });

  it('rejects unknown email', () => {
    const user = store.authenticate('nobody@test.com', 'Any1Pass');
    expect(user).toBeNull();
  });
});

describe('tenantStore', () => {
  let store: ReturnType<typeof createTenantStore>;

  beforeEach(() => {
    store = createTenantStore();
  });

  it('creates tenant', () => {
    const tenant = store.create('Test Team');
    expect(tenant.name).toBe('Test Team');
    expect(tenant.status).toBe('provisioning');
    expect(tenant.plan).toBe('standard');
    expect(tenant.id).toMatch(/^tenant-/);
  });

  it('finds tenant by id', () => {
    const tenant = store.create('My Team');
    const found = store.findById(tenant.id);
    expect(found?.name).toBe('My Team');
  });

  it('updates status', () => {
    const tenant = store.create('Team');
    store.updateStatus(tenant.id, 'active');
    expect(store.findById(tenant.id)?.status).toBe('active');
  });

  it('sets instance id', () => {
    const tenant = store.create('Team');
    store.setInstanceId(tenant.id, 'i-abc123');
    const updated = store.findById(tenant.id);
    expect(updated?.instanceId).toBe('i-abc123');
    expect(updated?.provisionedAt).toBeGreaterThan(0);
  });
});

describe('authService', () => {
  let authService: AuthService;
  let userStore: UserStore;
  let tenantStore: TenantStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    userStore = createUserStore();
    tenantStore = createTenantStore();
    sessionStore = createSessionStore();
    authService = createAuthService(userStore, tenantStore, sessionStore);
  });

  describe('signup', () => {
    it('creates user, tenant, and session', () => {
      const result = authService.signup({
        email: 'new@example.com',
        password: 'Strong1Pass',
        name: 'New User',
        teamName: 'New Team',
      });

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('new@example.com');
      expect(result.user?.role).toBe('owner');
      expect(result.session?.token).toBeTruthy();
      expect(result.session?.tenantId).toBeTruthy();
    });

    it('rejects invalid email', () => {
      const result = authService.signup({
        email: 'notanemail',
        password: 'Strong1Pass',
        name: 'Test',
        teamName: 'Team',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('email');
    });

    it('rejects duplicate email', () => {
      authService.signup({ email: 'dup@test.com', password: 'Strong1Pass', name: 'A', teamName: 'T' });
      const result = authService.signup({ email: 'dup@test.com', password: 'Strong1Pass', name: 'B', teamName: 'T2' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('rejects weak password', () => {
      const result = authService.signup({ email: 'a@b.com', password: 'weak', name: 'A', teamName: 'T' });
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('login', () => {
    beforeEach(() => {
      authService.signup({ email: 'user@test.com', password: 'MyPass123', name: 'User', teamName: 'Team' });
    });

    it('returns session on valid credentials', () => {
      const result = authService.login({ email: 'user@test.com', password: 'MyPass123' });
      expect(result.success).toBe(true);
      expect(result.session?.token).toBeTruthy();
      expect(result.user?.email).toBe('user@test.com');
    });

    it('rejects wrong password', () => {
      const result = authService.login({ email: 'user@test.com', password: 'Wrong1Pass' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('rejects unknown email', () => {
      const result = authService.login({ email: 'nobody@test.com', password: 'MyPass123' });
      expect(result.success).toBe(false);
    });

    it('rejects empty credentials', () => {
      const result = authService.login({ email: '', password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('logout', () => {
    it('invalidates session', () => {
      const signup = authService.signup({ email: 'out@test.com', password: 'MyPass123', name: 'A', teamName: 'T' });
      const token = signup.session!.token;
      authService.logout(token);
      const result = authService.validateSession(token);
      expect(result.success).toBe(false);
    });
  });

  describe('validateSession', () => {
    it('returns user for valid token', () => {
      const signup = authService.signup({ email: 'val@test.com', password: 'MyPass123', name: 'V', teamName: 'T' });
      const result = authService.validateSession(signup.session!.token);
      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('val@test.com');
    });

    it('rejects invalid token', () => {
      const result = authService.validateSession('garbage-token');
      expect(result.success).toBe(false);
    });
  });
});
