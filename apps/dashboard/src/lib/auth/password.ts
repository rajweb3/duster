import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const SALT_LENGTH = 32;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = deriveKey(password, salt);
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;
  const hash = deriveKey(password, salt);
  const storedBuf = Buffer.from(storedHash, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (storedBuf.length !== hashBuf.length) return false;
  return timingSafeEqual(storedBuf, hashBuf);
}

function deriveKey(password: string, salt: string): string {
  let result = createHash('sha512').update(salt + password).digest();
  for (let i = 1; i < ITERATIONS; i++) {
    result = createHash('sha512').update(result).update(salt).digest();
  }
  return result.subarray(0, KEY_LENGTH).toString('hex');
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: 'Password must be at least 8 characters' };
  if (password.length > 128) return { valid: false, reason: 'Password must be at most 128 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Password must contain an uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, reason: 'Password must contain a lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Password must contain a number' };
  return { valid: true };
}
