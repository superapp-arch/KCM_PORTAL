// Lightweight in-process rate limiter for auth-sensitive endpoints (login,
// OTP request, forgot-password request) - 2026-09-21 security hardening.
// No new dependency added - mirrors the same in-memory Map pattern this
// codebase already trusts for OTPs (see otp.ts).
//
// Deliberately generous per direct instruction ("do NOT permanently lock
// employees because of a few mistakes") - this exists to slow down
// scripted brute force/credential stuffing, not to lock out someone who
// mistypes their password a couple of times. A rejected/over-limit attempt
// is never itself recorded as an additional attempt, so a sustained attack
// can't extend its own lockout window indefinitely by continuing to hammer
// the endpoint.
//
// In-process only (like the OTP store) - a PM2 cluster with multiple
// instances, or a restart, resets these counters. That's an accepted
// trade-off for staying dependency-free and matching the OTP store's own
// existing behavior; a distributed limiter (e.g. Redis-backed) would be a
// separate, larger infrastructure decision.
interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

// Returns true (and records this attempt) when `key` is still under its
// limit within the window; returns false (does NOT record) once it's hit
// the cap - the caller should reject the request with 429 in that case.
export function checkRateLimit(key: string, config: RateLimitConfig): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  bucket.timestamps = bucket.timestamps.filter(t => now - t < config.windowMs);
  if (bucket.timestamps.length >= config.max) {
    return false;
  }
  bucket.timestamps.push(now);
  return true;
}

// Periodic cleanup so `buckets` doesn't grow forever with stale IPs/
// accounts nobody has hit in a long time - call once at server startup,
// same convention as session.ts's own startSessionCleanup.
export function startRateLimitCleanup(): NodeJS.Timeout {
  const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour - comfortably longer than any window used below
  const sweep = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter(t => now - t < STALE_AFTER_MS);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  };
  return setInterval(sweep, 15 * 60 * 1000);
}

// Named configs so every call site tunes the same knob consistently rather
// than each hardcoding its own numbers.
export const LOGIN_IP_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 30 }; // one IP hammering many accounts
export const LOGIN_ACCOUNT_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 10 }; // one account from many IPs (credential stuffing/brute force)
export const OTP_REQUEST_IP_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 20 };
export const OTP_REQUEST_ACCOUNT_LIMIT: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 5 }; // avoid email-bombing one inbox
