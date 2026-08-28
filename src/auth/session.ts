import { randomBytes } from 'node:crypto';
import { eq, lt, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { sessions } from '../db/schema.ts';
import { User } from '../types';

// Sessions are persisted in Postgres (see schema.ts's `sessions` table) so a
// PM2/Node restart or redeploy never silently drops every logged-in
// employee's session. Previously this was an in-memory Map only - wiped
// clean on every process restart even though browsers still held a now-
// orphaned token. That's the root cause behind employees appearing to "lose"
// work they thought they'd saved: a save request made with an
// orphaned/expired token got a 401 back, but nothing on the frontend told
// them that happened (see authFetch.ts), so the form just quietly failed
// while looking like nothing went wrong.
//
// Rolling/idle expiry: SESSION_IDLE_TTL_MS resets every time a valid,
// authenticated request comes in, so an employee actively working through
// the day is never abruptly logged out mid-shift. SESSION_ABSOLUTE_TTL_MS is
// a hard cap from login time regardless of activity, so a token still can't
// stay valid forever under continuous use - standard security hygiene, not
// something to drop.
// 2026-08-28: lowered from 12h to 4h - an employee who leaves the app open
// and logged in but genuinely idle (no requests at all) for 4 hours should
// be forced to log back in before entering anything further, rather than
// typing into what looks like a live session but is actually about to 401
// on save. Client-side, App.tsx's own idle timer mirrors this exact window
// so the UI proactively logs them out the moment it elapses too, instead of
// only reacting after a failed save.
const SESSION_IDLE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours of inactivity
const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days from login, max, regardless of activity

// Only persist a bumped lastActivityAt this often per session, not on every
// single request - an actively-used session fires many API calls a minute
// (see App.tsx's fetchAllData), and writing on every one would be pure
// database overhead for no real behavioral benefit (the idle window is
// hours wide; a few minutes of imprecision is invisible).
const ACTIVITY_UPDATE_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

interface CachedSession {
  user: User;
  createdAt: number;
  lastActivityAt: number;
}

// Read-through/write-behind in-memory cache in front of the DB, purely as a
// performance optimization (avoids a DB round trip on every authenticated
// request under normal operation) - it is never the source of truth. Being
// empty after a restart is completely fine: the next request for any given
// token just falls through to Postgres, finds it there, and re-populates the
// cache from that - unlike the old Map, losing this cache never logs anyone
// out.
const cache = new Map<string, CachedSession>();

function isExpired(session: CachedSession, now: number): boolean {
  return now - session.lastActivityAt > SESSION_IDLE_TTL_MS || now - session.createdAt > SESSION_ABSOLUTE_TTL_MS;
}

async function deleteSessionRow(token: string): Promise<void> {
  try {
    await db.delete(sessions).where(eq(sessions.token, token));
  } catch (error) {
    console.error('Failed to delete session row:', error);
  }
}

// Bumps the rolling idle window. The in-memory cache is always updated
// immediately (so this process's own idle-check stays accurate); the DB row
// is only rewritten once per ACTIVITY_UPDATE_THROTTLE_MS so a busy session
// doesn't hammer Postgres with a write per API call.
async function touchSession(token: string, session: CachedSession, now: number): Promise<void> {
  const shouldPersist = now - session.lastActivityAt > ACTIVITY_UPDATE_THROTTLE_MS;
  session.lastActivityAt = now;
  if (!shouldPersist) return;
  try {
    await db.update(sessions).set({ lastActivityAt: now }).where(eq(sessions.token, token));
  } catch (error) {
    // Non-fatal - the in-memory cache already has the fresh value, so this
    // process keeps working correctly; the DB row is just slightly stale
    // until the next throttle window (or a restart, which would then
    // slightly undercount elapsed idle time - biases toward staying logged
    // in, not toward an unexpected logout).
    console.error('Failed to persist session activity:', error);
  }
}

export async function createSession(user: User): Promise<string> {
  // 32 bytes of CSPRNG output, hex-encoded - a securely random bearer token,
  // not a guessable/sequential id.
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  await db.insert(sessions).values({
    token,
    username: user.username,
    userData: JSON.stringify(user),
    createdAt: now,
    lastActivityAt: now
  });
  cache.set(token, { user, createdAt: now, lastActivityAt: now });
  return token;
}

export async function getSessionUser(token?: string): Promise<User | undefined> {
  if (!token) return undefined;
  const now = Date.now();

  const cached = cache.get(token);
  if (cached) {
    if (isExpired(cached, now)) {
      cache.delete(token);
      await deleteSessionRow(token);
      return undefined;
    }
    await touchSession(token, cached, now);
    return cached.user;
  }

  // Cache miss - the process may have just (re)started, or this token was
  // issued by a different server instance/PM2 worker. Fall through to
  // Postgres, the actual source of truth, and fail safe (treat any DB error
  // as "not logged in" rather than crashing the request) on the way.
  try {
    const rows = await db.select().from(sessions).where(eq(sessions.token, token));
    const row = rows[0];
    if (!row) return undefined;
    const session: CachedSession = {
      user: JSON.parse(row.userData),
      createdAt: row.createdAt,
      lastActivityAt: row.lastActivityAt
    };
    if (isExpired(session, now)) {
      await deleteSessionRow(token);
      return undefined;
    }
    cache.set(token, session);
    await touchSession(token, session, now);
    return session.user;
  } catch (error) {
    console.error('Session lookup failed:', error);
    return undefined;
  }
}

export async function destroySession(token?: string): Promise<void> {
  if (!token) return;
  cache.delete(token);
  await deleteSessionRow(token);
}

export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) return undefined;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
}

// Periodic sweep for sessions nobody has touched recently enough to have
// already been deleted by the expiry check inside getSessionUser (e.g. an
// employee who logged in once and never returned) - pure housekeeping so the
// table doesn't grow forever. Not security-critical: an expired session is
// already rejected by getSessionUser regardless of whether its row still
// physically exists. Call once at server startup (see server.ts).
export function startSessionCleanup(): NodeJS.Timeout {
  const sweep = async () => {
    try {
      const now = Date.now();
      await db.delete(sessions).where(
        or(
          lt(sessions.createdAt, now - SESSION_ABSOLUTE_TTL_MS),
          lt(sessions.lastActivityAt, now - SESSION_IDLE_TTL_MS)
        )
      );
    } catch (error) {
      console.error('Session cleanup sweep failed:', error);
    }
  };
  sweep();
  return setInterval(sweep, 60 * 60 * 1000); // hourly
}
