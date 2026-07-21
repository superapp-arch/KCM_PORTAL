import { randomUUID } from 'node:crypto';
import { User } from '../types';

// Per-client session store: each logged-in browser/device gets its own
// token mapped to its own user record. Sessions expire after SESSION_TTL_MS
// of being issued, so a stolen or stale token can't be replayed forever.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

interface SessionRecord {
  user: User;
  expiresAt: number;
}

const sessionsByToken = new Map<string, SessionRecord>();

export function createSession(user: User): string {
  const token = randomUUID();
  sessionsByToken.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSessionUser(token?: string): User | undefined {
  if (!token) return undefined;
  const record = sessionsByToken.get(token);
  if (!record) return undefined;
  if (Date.now() > record.expiresAt) {
    sessionsByToken.delete(token);
    return undefined;
  }
  return record.user;
}

export function destroySession(token?: string): void {
  if (token) sessionsByToken.delete(token);
}

export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) return undefined;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
}
