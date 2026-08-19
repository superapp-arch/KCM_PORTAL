import type { KeyboardEvent } from 'react';

// Enter-to-complete for any Vehicle Number field that offers a searchable
// list (datalist/combo-box) of known vehicle numbers - typing just the last
// few digits (e.g. "9514") and pressing Enter resolves and fills in the full
// registration number instead of leaving the partial digits sitting in the
// field. Prefers a number ending with what was typed (the common "last 4
// digits" case), falling back to any number containing it; only resolves
// when that's unambiguous (exactly one candidate) - otherwise the field is
// left exactly as typed so the user can keep narrowing it down. Shared by
// every Vehicle Number field across the app (Fuel Management, Mileage
// Report, Warehouse Details, Petty Cash/Market POD) so they all behave the
// same way.
export function resolveVehicleNumberOnEnter(typed: string, knownVehicleNumbers: string[]): string | null {
  const target = typed.trim().toUpperCase();
  if (!target) return null;
  if (knownVehicleNumbers.some(v => v.toUpperCase() === target)) return null; // already an exact match - nothing to resolve
  const endsMatch = knownVehicleNumbers.filter(v => v.toUpperCase().endsWith(target));
  const candidates = endsMatch.length > 0 ? endsMatch : knownVehicleNumbers.filter(v => v.toUpperCase().includes(target));
  return candidates.length === 1 ? candidates[0] : null;
}

// Convenience wrapper for a plain <input onKeyDown> handler - resolves and
// calls setValue on Enter, and always preventDefault()s Enter on this field
// so it never prematurely submits the surrounding form.
export function handleVehicleNumberEnterKey(
  e: KeyboardEvent<HTMLInputElement>,
  currentValue: string,
  knownVehicleNumbers: string[],
  setValue: (next: string) => void
): void {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const resolved = resolveVehicleNumberOnEnter(currentValue, knownVehicleNumbers);
  if (resolved) setValue(resolved);
}
