// Shared EMI date math for Loan Management (Vehicle Loan + Business Loan)
// and Fleet & Vehicles' read-only EMI Details view - all three read the same
// VehicleLoan/BusinessLoan records and must agree on Months Completed/EMI
// Paid and Due Date, so the calculation lives in one place.

function daysInCalendarMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

// Adds `months` calendar months to (year, monthIndex0, day), clamping the
// day to the target month's actual last day instead of letting the Date
// constructor roll over into the following month. `new Date(y, m, 31)`
// silently overflows into the next month whenever the target month has
// fewer than 31 days (e.g. Sept 31 -> Oct 1) - for an EMI start day of 29,
// 30 or 31 that shifted the Due Date a day late and delayed Months
// Completed/EMI Paid by a period at every 28/29/30-day month crossed
// (Feb, Apr, Jun, Sep, Nov).
function addMonthsClamped(year: number, monthIndex0: number, day: number, months: number): Date {
  const totalMonthIndex = monthIndex0 + months;
  const targetYear = year + Math.floor(totalMonthIndex / 12);
  const targetMonthIndex0 = ((totalMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(day, daysInCalendarMonth(targetYear, targetMonthIndex0));
  return new Date(targetYear, targetMonthIndex0, clampedDay);
}

// Finds k = how many EMI due-dates (startDate, startDate+1mo, +2mo, ...)
// have already fully passed as of today. The due date itself still counts as
// "not yet passed" on its own day - it only rolls to the next month's due
// date starting the day *after*, e.g. a June 10 due date stays June 10 all
// day June 10, and becomes July 10 starting June 11.
function findElapsedPeriods(startDate: string): number {
  if (!startDate) return 0;
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m) return 0;
  const startDay = d || 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calendarMonthsDiff = (today.getFullYear() - y) * 12 + (today.getMonth() - (m - 1));
  const candidateDue = addMonthsClamped(y, m - 1, startDay, calendarMonthsDiff);
  const k = candidateDue >= today ? calendarMonthsDiff : calendarMonthsDiff + 1;
  return Math.max(0, k);
}

// Months Completed / EMI Paid: how many EMI periods have already passed,
// capped at Tenure once the schedule is fully covered.
export function computeMonthsCompleted(startDate: string | undefined, tenure: number | undefined): number {
  if (!startDate) return 0;
  const elapsed = findElapsedPeriods(startDate);
  return tenure != null ? Math.min(elapsed, tenure) : elapsed;
}

// Next Due Date: the smallest (startDate + k months) that hasn't passed yet.
// Reads "Completed" once Months Completed reaches Tenure.
export function computeDueDate(startDate: string | undefined, monthsCompleted: number, tenure: number | undefined): string {
  if (!startDate) return '-';
  if (tenure != null && monthsCompleted >= tenure) return 'Completed';
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m) return '-';
  const due = addMonthsClamped(y, m - 1, d || 1, monthsCompleted);
  return due.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Auto-computed Loan Status: Closed once every EMI period has elapsed
// (Months Completed reaches Tenure), Active otherwise. Used to default/
// auto-fill the Loan Status field in the Vehicle/Business Loan forms
// whenever EMI Start Date or Tenure change - like Fuel Entry's Amount field,
// it's an editable auto-fill, not a forced read-only value, so an admin can
// still deliberately override it afterward.
export function computeLoanStatus(monthsCompleted: number, tenure: number | undefined): 'Active' | 'Closed' {
  return tenure != null && monthsCompleted >= tenure ? 'Closed' : 'Active';
}

// What to actually display/export as Loan Status: the auto-computed value by
// default (so a loan that's fully paid off always reads Closed without
// needing to be re-saved), except when an employee has explicitly forced a
// different value (loanStatusManual) - e.g. marking a fully-paid loan back to
// Active over a payment/amount dispute. That override stays sticky until the
// employee changes it back (or picks the same value the system would've
// computed anyway, which clears the manual flag - see VehicleLoanSheet.tsx/
// BusinessLoanSheet.tsx's Loan Status dropdown onChange).
export function resolveLoanStatus(storedStatus: 'Active' | 'Closed', manual: boolean | undefined, monthsCompleted: number, tenure: number | undefined): 'Active' | 'Closed' {
  return manual ? storedStatus : computeLoanStatus(monthsCompleted, tenure);
}

// Raw next due date as a Date (or null), for alerting logic (e.g. "3 days
// before due") that needs to compare actual dates rather than a label.
export function computeDueDateRaw(startDate: string | undefined, tenure: number | undefined): Date | null {
  if (!startDate) return null;
  const monthsCompleted = computeMonthsCompleted(startDate, tenure);
  if (tenure != null && monthsCompleted >= tenure) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m) return null;
  return addMonthsClamped(y, m - 1, d || 1, monthsCompleted);
}
