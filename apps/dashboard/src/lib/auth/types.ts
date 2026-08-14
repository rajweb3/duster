export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: number;
  lastLoginAt: number;
}

export interface Tenant {
  id: string;
  name: string;
  plan: 'standard';
  status: 'provisioning' | 'active' | 'suspended' | 'terminated';
  instanceId?: string;
  createdAt: number;
  provisionedAt?: number;
}

export interface Session {
  userId: string;
  tenantId: string;
  token: string;
  expiresAt: number;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  teamName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  session?: Session;
  error?: string;
}
