import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;
const BCRYPT_HASH_PATTERN = /^\$2[aby]?\$\d{2}\$/;

export function isHashed(stored?: string | null): boolean {
  return !!stored && BCRYPT_HASH_PATTERN.test(stored);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// Verifies a submitted password against the stored value. Stored values that
// aren't yet a bcrypt hash (legacy rows not yet migrated) fall back to a
// direct comparison so existing accounts keep working until they're hashed.
export async function verifyPassword(plain: string, stored?: string | null): Promise<boolean> {
  if (!stored) return false;
  if (!isHashed(stored)) return plain === stored;
  return bcrypt.compare(plain, stored);
}
