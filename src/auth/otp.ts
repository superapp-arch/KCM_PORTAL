// One-time-passcode store with expiry and a capped number of guesses, keyed
// by lowercased email. Replaces a plain Record<string,string> that never
// expired and accepted unlimited guesses.
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

const activeOtps = new Map<string, OtpRecord>();

export function issueOtp(email: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  activeOtps.set(email.trim().toLowerCase(), { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return code;
}

export function verifyOtp(email: string, submitted: string): { valid: boolean; reason?: string } {
  const key = email.trim().toLowerCase();
  const record = activeOtps.get(key);

  if (!record) {
    return { valid: false, reason: 'No active OTP for this account. Please request a new code.' };
  }
  if (Date.now() > record.expiresAt) {
    activeOtps.delete(key);
    return { valid: false, reason: 'OTP has expired. Please request a new code.' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    activeOtps.delete(key);
    return { valid: false, reason: 'Too many incorrect attempts. Please request a new code.' };
  }
  if (record.code !== submitted) {
    record.attempts += 1;
    return { valid: false, reason: 'Incorrect OTP code.' };
  }

  activeOtps.delete(key);
  return { valid: true };
}

export function clearOtp(email: string): void {
  activeOtps.delete(email.trim().toLowerCase());
}
