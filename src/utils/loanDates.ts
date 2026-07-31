// Shared EMI date math for Loan Management (Vehicle Loan + Business Loan)
// and Fleet & Vehicles' read-only EMI Details view - all three read the same
// VehicleLoan/BusinessLoan records and must agree on Months Completed/EMI
// Paid and Due Date, so the calculation lives in one place.

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
  const candidateDue = new Date(y, m - 1 + calendarMonthsDiff, startDay);
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
  const due = new Date(y, m - 1 + monthsCompleted, d || 1);
  return due.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Raw next due date as a Date (or null), for alerting logic (e.g. "3 days
// before due") that needs to compare actual dates rather than a label.
export function computeDueDateRaw(startDate: string | undefined, tenure: number | undefined): Date | null {
  if (!startDate) return null;
  const monthsCompleted = computeMonthsCompleted(startDate, tenure);
  if (tenure != null && monthsCompleted >= tenure) return null;
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1 + monthsCompleted, d || 1);
}
