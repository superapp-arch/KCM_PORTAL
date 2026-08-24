// Reusable redaction for Audit Trail oldData/newData snapshots (see
// createAuditLog in service.ts, which always runs both through this before
// storing them). Never store real credentials/secrets in an audit record,
// no matter which module's object gets logged.
//
// Matching is case/separator-insensitive (lowercased, non-letters stripped)
// so "New Password", "newPassword", and "new_password" are all caught by
// the same "newpassword" entry - callers pass through raw request bodies
// from many different modules, whose key casing isn't consistent.
const SENSITIVE_KEYS = new Set([
  'password', 'pass', 'confirmpassword', 'newpassword', 'oldpassword', 'currentpassword',
  'otp', 'code', 'token', 'accesstoken', 'refreshtoken', 'sessiontoken', 'bearertoken',
  'apikey', 'secret', 'clientsecret', 'privatekey', 'authorization', 'auth', 'pin',
]);

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z]/g, '');

// Walks the object tree (arrays included) and replaces any value whose key
// matches SENSITIVE_KEYS with a fixed placeholder - the value itself is
// never inspected or logged, only the key name decides. Depth-capped so a
// pathological/circular-ish structure can't hang audit logging; anything
// past that depth is dropped rather than risk leaking it unredacted.
const MAX_DEPTH = 8;
const REDACTED = '[REDACTED]';

export function redactSensitive<T>(value: T, depth = 0): T {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]' as unknown as T;

  if (Array.isArray(value)) {
    return value.map(item => redactSensitive(item, depth + 1)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) {
      out[key] = REDACTED;
    } else if (val !== null && typeof val === 'object') {
      out[key] = redactSensitive(val, depth + 1);
    } else {
      out[key] = val;
    }
  }
  return out as T;
}
