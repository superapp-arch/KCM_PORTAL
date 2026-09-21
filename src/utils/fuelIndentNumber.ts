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
//
// 2026-09-18: further scoped per Location too - the same bunk BRAND (e.g.
// HPCL) can exist at several different physical locations (see
// LOCATION_BUNK_MAP/BUNK_LOCATION_MAP in FuelManagement.tsx), each with its
// own real, independently-numbered paper register. Without this, HPCL at
// Bangalore and HPCL at Chennai would silently share one indent sequence,
// exactly the bug class the bunk-name fix above already closed once for
// bunk name alone.
import { extractLeadingNumber } from './sort';

interface IndentableFuelLog {
  id?: string; // only needed by findDuplicateFuelIndentNumber's excludeId check below
  bunkOrCard?: string;
  bunkName?: string;
  location?: string;
  date?: string;
  enteredBy?: string;
  indentNumber?: string;
}

const normBunkName = (name: string | undefined) => (name || '').trim().toLowerCase();
const normLocation = (name: string | undefined) => (name || '').trim().toLowerCase();

// Bunk: plain numeric string (e.g. "6412"), continuing within the entry's
// own Date's calendar month, its own bunk name, AND its own location. The
// first entry of a new (bunk, location, month) combination has nothing to
// continue from (returns null), so the office types a fresh starting number
// by hand; every entry after that, same bunk, same location, same month,
// auto-continues from the MOST RECENTLY DATED entry already saved for that
// exact (bunk, location) pair - NOT the highest number ever seen this month
// (2026-09-21 fix). A high-volume "pillar" bunk logs continuously off a
// physical paper book/register whose own printed numbering can legitimately
// restart lower when the office switches to a fresh book mid-month (e.g.
// book 1 ends at 587, book 2 starts at 002) - the very next real entry after
// that switch is manually typed as "002", and every entry after THAT must
// keep following book 2's own numbering (003, 004, ...), not jump back to
// "588" just because 587 is still the highest number this bunk/location/
// month has ever recorded. Ties on the same date fall back to whichever
// entry's own id sorts last (ids are timestamp-based - see saveFuelLog's own
// fallback - so this is "whichever was actually saved most recently").
export function nextBunkFuelIndentNumber(logs: IndentableFuelLog[], refDate: string, bunkName: string | undefined, location: string | undefined, enteredBy: string | undefined): string | null {
  const monthKey = (refDate || '').slice(0, 7);
  if (!monthKey) return null;
  const monthEntries = logs
    .filter(l =>
      (l.bunkOrCard || 'Bunk') === 'Bunk' &&
      (l.date || '').slice(0, 7) === monthKey &&
      normBunkName(l.bunkName) === normBunkName(bunkName) &&
      normLocation(l.location) === normLocation(location) &&
      (l.enteredBy || '') === (enteredBy || '') &&
      extractLeadingNumber(l.indentNumber) > 0
    );
  if (monthEntries.length === 0) return null;
  const latest = [...monthEntries].sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.id || '').localeCompare(a.id || '');
  })[0];
  return String(extractLeadingNumber(latest.indentNumber) + 1);
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

// 2026-09-11: promoted here from server.ts (was server-only) so the Fuel
// Excel/Card Import wizard's client-side preview can call the EXACT SAME
// duplicate-identity check POST/PUT /api/fuel independently re-run at
// actual-save time - "the correct existing business identity", never a
// separately-invented one, and the preview can never disagree with what
// the server will actually do. server.ts now imports this instead of
// keeping its own copy.
//
// Duplicate guard for all three sequences - scoped to match how each is
// generated: Bunk within the same (bunk name, calendar month, enteredBy)
// bucket (2026-09-04: bunk name added to match nextBunkFuelIndentNumber's
// own scoping - the same number can legitimately recur across different
// bunks, different months, or different people), Card across its whole
// per-person sequence (never resets, so no two Card entries by the SAME
// person should ever share a number - two different people's Card
// sequences may coincide freely). Petty Cash (2026-09-09) has no
// auto-generated sequence at all (typed manually every time - see
// nextPettyCashEntryNo's own "Petty Cash" pattern for the equivalent Petty
// Cash module concept) - scoped the same way as Card, one continuous
// per-person space, entirely separate from both Bunk and Card. Only ever
// rejects a genuinely new-to-this-id value - resubmitting a record's own
// unchanged Indent No (a normal edit that didn't touch it) always passes.
export function findDuplicateFuelIndentNumber(
  logs: IndentableFuelLog[],
  indentNumber: string | undefined,
  candidate: { bunkOrCard?: string; bunkName?: string; location?: string; date?: string; enteredBy?: string },
  excludeId?: string
): boolean {
  const target = (indentNumber || '').trim().toUpperCase();
  if (!target) return false;
  const classify = (v: string | undefined) => (v === 'Card' ? 'Card' : v === 'Petty Cash' ? 'Petty Cash' : 'Bunk');
  const candidateClass = classify(candidate.bunkOrCard);
  const monthKey = (candidate.date || '').slice(0, 7);
  const bunkNameKey = normBunkName(candidate.bunkName);
  const locationKey = normLocation(candidate.location);
  return logs.some(l => {
    if (l.id === excludeId) return false;
    if ((l.indentNumber || '').trim().toUpperCase() !== target) return false;
    if ((l.enteredBy || '') !== (candidate.enteredBy || '')) return false; // separate sequence per person
    if (classify(l.bunkOrCard) !== candidateClass) return false;
    if (candidateClass !== 'Bunk') return true; // Card/Petty Cash: one sequence per person, no month/bunk/location scoping
    if (normBunkName(l.bunkName) !== bunkNameKey) return false; // separate sequence per bunk
    if (normLocation(l.location) !== locationKey) return false; // separate sequence per location too (see nextBunkFuelIndentNumber)
    return (l.date || '').slice(0, 7) === monthKey;
  });
}
