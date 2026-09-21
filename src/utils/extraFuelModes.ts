// Shared Extra Fuel payment-mode resolver (2026-09-21 direct request) - the
// Mileage tab's Extra Fuel top-up can now be tagged as paid by any
// combination of Bunk/Petty Cash/Card (previously just an exclusive single
// choice, then Petty Cash+Card together as a special "both" case) - this is
// PURELY an accounting/traceability tag; MileageReport.totalLitres/
// totalAmount always include every mode's amount regardless (see that
// field's own comment in types.ts).
//
// MileageReport.extraFuelModes (new, array-based, multi-mode-capable) is
// the source of truth for any record saved by this or a later fix. The
// older singular extraFuelPaymentMode field ('normal'/'petty_cash'/'card'/
// 'both') is still read here for full backward compatibility with records
// saved before extraFuelModes existed - every reader (FuelManagement.tsx,
// MileageReport.tsx) goes through resolveExtraFuelModes/extraFuelSlices
// instead of reading either field directly, so old- and new-shaped records
// always resolve identically.
export type ExtraFuelMode = 'bunk' | 'petty_cash' | 'card';

export const EXTRA_FUEL_MODE_LABELS: Record<ExtraFuelMode, string> = {
  bunk: 'Bunk',
  petty_cash: 'Petty Cash',
  card: 'Card'
};

interface ExtraFuelModeFields {
  extraFuelModes?: ExtraFuelMode[];
  extraFuelPaymentMode?: 'normal' | 'petty_cash' | 'card' | 'both';
}

// Which mode(s) this record's Extra Fuel is tagged with - [] means untagged/
// "normal" (implicitly the regular Bunk/vendor account, same as always).
export function resolveExtraFuelModes(record: ExtraFuelModeFields): ExtraFuelMode[] {
  if (record.extraFuelModes && record.extraFuelModes.length > 0) return record.extraFuelModes;
  switch (record.extraFuelPaymentMode) {
    case 'petty_cash': return ['petty_cash'];
    case 'card': return ['card'];
    case 'both': return ['petty_cash', 'card'];
    default: return [];
  }
}

interface ExtraFuelAmountFields extends ExtraFuelModeFields {
  extraFuel?: number; // grand total across every active mode - always this meaning, for every record shape
  extraFuelBunkAmount?: number;
  extraFuelPettyCashAmount?: number;
  extraFuelCardAmount?: number;
}

// Per-mode breakdown of `extraFuel` (the grand total) - only the modes
// actually active are present as keys. With 0 or 1 mode active, the single
// active mode (if any) simply gets the WHOLE `extraFuel` amount (there's
// nothing to split - this is also exactly today's already-established
// single-mode convention, unchanged). With 2+ modes active, each gets its
// own explicit slice field - except a legacy two-mode ('both': Petty
// Cash+Card) record saved before extraFuelPettyCashAmount existed, where
// the Petty Cash slice is still exactly recoverable as
// extraFuel - extraFuelCardAmount (that was always the old 'both'
// convention's own meaning).
export function extraFuelSlices(record: ExtraFuelAmountFields): Partial<Record<ExtraFuelMode, number>> {
  const modes = resolveExtraFuelModes(record);
  if (modes.length === 0) return {};
  if (modes.length === 1) return { [modes[0]]: record.extraFuel || 0 };
  const cardAmount = record.extraFuelCardAmount || 0;
  const bunkAmount = record.extraFuelBunkAmount || 0;
  const pettyCashAmount = record.extraFuelPettyCashAmount != null
    ? record.extraFuelPettyCashAmount
    : (modes.includes('petty_cash') && !modes.includes('bunk') ? (record.extraFuel || 0) - cardAmount : 0);
  const result: Partial<Record<ExtraFuelMode, number>> = {};
  if (modes.includes('bunk')) result.bunk = bunkAmount;
  if (modes.includes('petty_cash')) result.petty_cash = pettyCashAmount;
  if (modes.includes('card')) result.card = cardAmount;
  return result;
}

// Best-effort legacy extraFuelPaymentMode value for a set of active modes -
// written alongside the new extraFuelModes array on every save so any code
// that still only reads the old singular field degrades gracefully instead
// of breaking. Only 'petty_cash'/'card' (single) and 'both' (exactly Petty
// Cash+Card) have a real legacy equivalent; every other combination
// (anything involving Bunk together with another mode, or all three) falls
// back to 'normal' - safe because it's a display-tag fallback only, never a
// calculation input, and every reader in THIS app already prefers
// extraFuelModes via resolveExtraFuelModes above.
export function legacyExtraFuelPaymentMode(modes: ExtraFuelMode[]): 'normal' | 'petty_cash' | 'card' | 'both' {
  if (modes.length === 0) return 'normal';
  if (modes.length === 1) return modes[0] === 'bunk' ? 'normal' : modes[0];
  if (modes.length === 2 && modes.includes('petty_cash') && modes.includes('card')) return 'both';
  return 'normal';
}
