// Shared password strength rule (2026-09-21 security hardening) - imported
// by both server.ts (the actual enforcement, on Change Password and Forgot
// Password reset) and the two client-side forms (Administration.tsx,
// Login.tsx) so the same rule is described/validated in one place instead of
// each form inventing its own ad-hoc length check (they previously
// disagreed: one said "at least 5 characters", the other "at least 6").
//
// Deliberately modest - this is a logistics back-office tool with a fixed
// roster of real employees, not a public consumer product, and the goal is
// to rule out trivially-guessable passwords (blank, "12345", a name) without
// making already-memorized passwords hard to reproduce or locking anyone out
// over a strictness level nobody asked for.
export const PASSWORD_POLICY_DESCRIPTION = 'At least 8 characters, including at least one letter and one number.';

export function validatePasswordStrength(password: string): string | null {
  const value = String(password || '');
  if (value.length < 8) {
    return 'New password must be at least 8 characters long.';
  }
  if (!/[a-zA-Z]/.test(value)) {
    return 'New password must include at least one letter.';
  }
  if (!/[0-9]/.test(value)) {
    return 'New password must include at least one number.';
  }
  return null;
}
