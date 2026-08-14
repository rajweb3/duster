import type { SignupRequest, LoginRequest, AuthResult } from './types.js';
import { validatePasswordStrength } from './password.js';
import { createSession } from './session.js';
import type { SessionStore } from './session.js';
import type { UserStore, TenantStore } from './user-store.js';

export interface AuthService {
  signup(request: SignupRequest): AuthResult;
  login(request: LoginRequest): AuthResult;
  logout(token: string): void;
  validateSession(token: string): AuthResult;
}

export function createAuthService(
  userStore: UserStore,
  tenantStore: TenantStore,
  sessionStore: SessionStore,
): AuthService {
  return {
    signup(request: SignupRequest): AuthResult {
      const { email, password, name, teamName } = request;

      if (!email || !email.includes('@')) {
        return { success: false, error: 'Invalid email address' };
      }

      const existing = userStore.findByEmail(email);
      if (existing) {
        return { success: false, error: 'Email already registered' };
      }

      const strength = validatePasswordStrength(password);
      if (!strength.valid) {
        return { success: false, error: strength.reason };
      }

      const tenant = tenantStore.create(teamName);
      const record = userStore.createUser(email, password, name, tenant.id, 'owner');
      const session = createSession(record.user.id, tenant.id);
      sessionStore.set(session);

      return { success: true, user: record.user, session };
    },

    login(request: LoginRequest): AuthResult {
      const { email, password } = request;

      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      const user = userStore.authenticate(email, password);
      if (!user) {
        return { success: false, error: 'Invalid email or password' };
      }

      const session = createSession(user.id, user.tenantId);
      sessionStore.set(session);

      return { success: true, user, session };
    },

    logout(token: string): void {
      sessionStore.delete(token);
    },

    validateSession(token: string): AuthResult {
      const session = sessionStore.get(token);
      if (!session) {
        return { success: false, error: 'Invalid or expired session' };
      }

      const record = userStore.findById(session.userId);
      if (!record) {
        sessionStore.delete(token);
        return { success: false, error: 'User not found' };
      }

      return { success: true, user: record.user, session };
    },
  };
}
