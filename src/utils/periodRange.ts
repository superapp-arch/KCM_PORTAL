// Resolves the [start, end] date-string window (inclusive) for a "Day /
// Monthly Till Date / Year Till Date" period relative to a reference date -
// shared by Fuel Management's on-screen ledger view-scope tabs, its
// "Download Fuel Report" panel, and the PC Diesel Expense view (independent
// controls, same underlying math).
export const getPeriodDateRange = (period: 'day' | 'month' | 'year', refDate: string): { start: string; end: string } => {
  if (period === 'day') return { start: refDate, end: refDate };
  if (period === 'month') return { start: `${refDate.slice(0, 7)}-01`, end: refDate };
  return { start: `${refDate.slice(0, 4)}-01-01`, end: refDate };
};
