// Fuel Entry Indent No generation - the ONE canonical implementation,
// imported by both server.ts (the real, authoritative generator behind
// GET /api/fuel/next-indent-number) and FuelManagement.tsx (as a same-tab
// fallback estimate if that request fails - see the client's own comment on
// why a fallback exists at all). Keeping this in one shared file means the
// two can never quietly drift apart the way two hand-copied algorithms
// eventually do.
//
// Bunk and Card are two completely independent sequences, both computed
// fresh from every saved fuel log (never an in-memory counter) so they stay
// correct across server restarts, deployments, and concurrent users. A
// pre-existing FuelLog saved before the bunkOrCard field existed is treated
// as 'Bunk' - the same default the Add Entry form itself has always used.
//
// Both sequences are further scoped per enteredBy - each fuel-access login
// gets their own independent Bunk sequence and their own independent Card
// sequence (always starts at 00001), so two different people's Indent Nos
// are never mixed up, told apart only by who entered them. A legacy row
// with no enteredBy at all buckets under '' - isolated from every real
// login's own sequence.
//
// Bunk is ALSO scoped per bunk name (2026-09-04 fix - it previously wasn't,
// which silently merged every bunk one person filled up at into one shared
// monthly sequence: e.g. ABC Bunk manually started at 001 and BCD Bunk
// manually started at 501 that same month would make ABC's very next entry
// come out as 502, continuing off BCD's higher starting number, instead of
// its own 002). Each (bunk name, calendar month, enteredBy) combination now
// keeps its own independent run, matching each bunk's own manually-typed
// starting number exactly as the office actually uses it.
import { extractLeadingNumber } from './sort';

interface IndentableFuelLog {
  bunkOrCard?: string;
  bunkName?: string;
  date?: string;
  enteredBy?: string;
  indentNumber?: string;
}

const normBunkName = (name: string | undefined) => (name || '').trim().toLowerCase();

// Bunk: plain numeric string (e.g. "6412"), continuing within the entry's
// own Date's calendar month AND its own bunk name. The first entry of a new
// (bunk, month) combination has nothing to continue from (returns null), so
// the office types a fresh starting number by hand; every entry after that,
// same bunk, same month, auto-continues from the highest one already saved
// for that exact bunk.
export function nextBunkFuelIndentNumber(logs: IndentableFuelLog[], refDate: string, bunkName: string | undefined, enteredBy: string | undefined): string | null {
  const monthKey = (refDate || '').slice(0, 7);
  if (!monthKey) return null;
  const monthNumbers = logs
    .filter(l => (l.bunkOrCard || 'Bunk') === 'Bunk' && (l.date || '').slice(0, 7) === monthKey && normBunkName(l.bunkName) === normBunkName(bunkName) && (l.enteredBy || '') === (enteredBy || ''))
    .map(l => extractLeadingNumber(l.indentNumber))
    .filter(n => n > 0);
  if (monthNumbers.length === 0) return null;
  return String(Math.max(...monthNumbers) + 1);
}

// Card: zero-padded 5-digit string (e.g. "00001"), one single continuously-
// incrementing sequence that never resets monthly - entirely independent of
// Bunk's. Starts fresh at 00001: only entries whose Indent No is already in
// this exact 5-digit shape count toward "the sequence".
export function nextCardFuelIndentNumber(logs: IndentableFuelLog[], enteredBy: string | undefined): string {
  const cardNumbers = logs
    .filter(l => l.bunkOrCard === 'Card' && /^\d{5}$/.test((l.indentNumber || '').trim()) && (l.enteredBy || '') === (enteredBy || ''))
    .map(l => parseInt((l.indentNumber || '').trim(), 10))
    .filter(n => !isNaN(n) && n > 0);
  const next = cardNumbers.length > 0 ? Math.max(...cardNumbers) + 1 : 1;
  return String(next).padStart(5, '0');
}
