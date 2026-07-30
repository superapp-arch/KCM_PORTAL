// Shared EMI date math for Loan Management (Vehicle Loan + Business Loan)
// and Fleet & Vehicles' read-only EMI Details view - all three read the same
// VehicleLoan/BusinessLoan records and must agree on Months Completed/EMI
// Paid and Due Date, so the calculation lives in one place.

// Whole months elapsed between startDate and today, based on calendar
// anniversary day (not counted until that day is reached each month).
function monthsElapsedSince(startDate: string): number {
  if (!startDate) return 0;
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m) return 0;
  const start = new Date(y, m - 1, d || 1);
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < (d || 1)) months -= 1;
  return Math.max(0, months);
}

// Months Completed / EMI Paid: elapsed months since the start date, capped
// at Tenure once the schedule is fully covered.
export function computeMonthsCompleted(startDate: string | undefined, tenure: number | undefined): number {
  if (!startDate) return 0;
  const elapsed = monthsElapsedSince(startDate);
  return tenure != null ? Math.min(elapsed, tenure) : elapsed;
}

// Next Due Date: startDate advanced by monthsCompleted months - i.e. the due
// date of the next (monthsCompleted + 1)-th EMI. Reads "Completed" once
// Months Completed reaches Tenure.
export function computeDueDate(startDate: string | undefined, monthsCompleted: number, tenure: number | undefined): string {
  if (!startDate) return '-';
  if (tenure != null && monthsCompleted >= tenure) return 'Completed';
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m) return '-';
  const due = new Date(y, m - 1 + monthsCompleted, d || 1);
  return due.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
