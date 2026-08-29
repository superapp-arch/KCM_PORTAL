// Driver Salary's "Petty Cash/Advance" figure (2026-08-29) - auto-fetched
// from Petty Cash's own "DRIVER SALARY ADV" expense category instead of
// being typed by hand in Driver Salary's own Salary Breakup form. Matched by
// Vendor ID (Petty Cash's own column name for it) against the Driver ID,
// scoped to the salary month being edited - if the same driver gets it more
// than once that month (2-3 separate Petty Cash entries), all of them add
// together into one total, same as a real running deduction would.
//
// Sourced from GET /api/drivers/petty-cash-advances - a narrow, Driver-
// Details-gated slice of Petty Cash (just this one category's vendorId/
// date/cashPaid/enteredBy), not the full Petty Cash ledger, so someone with
// Driver Details access but no Petty Cash module access of their own still
// sees these figures correctly instead of an empty/stale total.
export interface DriverSalaryAdvanceVoucherSlim {
  vendorId?: string;
  date: string;
  cashPaid?: number;
  enteredBy?: string; // present only for a Super Admin/Principal viewer - masked server-side for everyone else
}

export interface DriverPettyCashAdvanceEntry {
  date: string;
  amount: number;
  enteredBy?: string; // who logged it in Petty Cash - shown on hover
}

export interface DriverPettyCashAdvanceResult {
  total: number;
  entries: DriverPettyCashAdvanceEntry[];
}

// `month` is YYYY-MM. Matches vendorId case/whitespace-insensitively against
// driverId, since Petty Cash's Vendor ID is free-typed by the desk handling
// it, not selected from a locked list.
export function computeDriverPettyCashAdvance(
  slimVouchers: DriverSalaryAdvanceVoucherSlim[], driverId: string, month: string
): DriverPettyCashAdvanceResult {
  const targetDriverId = (driverId || '').trim().toUpperCase();
  if (!targetDriverId || !month) return { total: 0, entries: [] };

  const matches = slimVouchers.filter(v =>
    (v.vendorId || '').trim().toUpperCase() === targetDriverId &&
    (v.date || '').slice(0, 7) === month
  );

  const entries: DriverPettyCashAdvanceEntry[] = matches
    .map(v => ({ date: v.date, amount: v.cashPaid || 0, enteredBy: v.enteredBy }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { total: entries.reduce((s, e) => s + e.amount, 0), entries };
}

// Short hover-tooltip summary, e.g. "2 Petty Cash entries this month:
// ₹2,000 on 2026-08-05 (by ramesh); ₹1,500 on 2026-08-19 (by vinoda)" - or a
// plain "No Petty Cash entries this month" when there's nothing to show.
// `enteredBy` is only ever present for a Super Admin/Principal viewer
// (server strips it for everyone else, same masking every other module's
// enteredBy already uses) - falls back to omitting the "by ..." clause
// rather than showing "by undefined" for anyone else.
export function driverPettyCashAdvanceTooltip(result: DriverPettyCashAdvanceResult): string {
  if (result.entries.length === 0) return 'No Petty Cash "DRIVER SALARY ADV" entries this month.';
  const lines = result.entries.map(e =>
    `₹${e.amount.toLocaleString('en-IN')} on ${e.date}${e.enteredBy ? ` (by ${e.enteredBy})` : ''}`
  );
  return `${result.entries.length} Petty Cash entr${result.entries.length === 1 ? 'y' : 'ies'} this month: ${lines.join('; ')}`;
}
