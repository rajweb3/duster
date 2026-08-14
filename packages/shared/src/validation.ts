import { z } from 'zod';
import {
  TenantMessage,
  DashboardMessage,
  HeartbeatMessage,
  CommandMessage,
  AnyMessage,
} from './messages.js';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: z.ZodIssue[] };

export function validateTenantMessage(raw: unknown): ValidationResult<z.infer<typeof TenantMessage>> {
  const result = TenantMessage.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function validateDashboardMessage(raw: unknown): ValidationResult<z.infer<typeof DashboardMessage>> {
  const result = DashboardMessage.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function validateHeartbeat(raw: unknown): ValidationResult<z.infer<typeof HeartbeatMessage>> {
  const result = HeartbeatMessage.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function validateCommand(raw: unknown): ValidationResult<z.infer<typeof CommandMessage>> {
  const result = CommandMessage.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function validateAnyMessage(raw: unknown): ValidationResult<z.infer<typeof AnyMessage>> {
  const result = AnyMessage.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.message,
    issues: result.error.issues,
  };
}

export function parseJsonMessage(json: string): ValidationResult<z.infer<typeof AnyMessage>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON',
      issues: [{ code: 'custom', message: 'Failed to parse JSON', path: [] }],
    };
  }
  return validateAnyMessage(parsed);
}
