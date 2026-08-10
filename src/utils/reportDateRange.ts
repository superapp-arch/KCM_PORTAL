// Shared Daily/Weekly/Monthly/Yearly/Custom date-range math for the Reports
// module - every connected module's report is filtered through the same
// ReportRange shape so there's one date-range picker UI and one filtering
// convention, rather than each module reinventing its own.

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface ReportRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string;   // YYYY-MM-DD, inclusive
  label: string; // human-readable, for the on-screen header and export title
}

const fmt = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Monday-start week (matches how this app's other week-based views assume
// the work week starts).
const startOfWeek = (d: Date): Date => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date;
};

export function getReportRange(period: ReportPeriod, anchorDate: string, customStart?: string, customEnd?: string): ReportRange {
  const anchor = anchorDate ? new Date(anchorDate) : new Date();

  if (period === 'daily') {
    return { start: fmt(anchor), end: fmt(anchor), label: fmt(anchor) };
  }
  if (period === 'weekly') {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: fmt(start), end: fmt(end), label: `${fmt(start)} to ${fmt(end)}` };
  }
  if (period === 'monthly') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: fmt(start), end: fmt(end), label: start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  }
  if (period === 'yearly') {
    const start = new Date(anchor.getFullYear(), 0, 1);
    const end = new Date(anchor.getFullYear(), 11, 31);
    return { start: fmt(start), end: fmt(end), label: String(anchor.getFullYear()) };
  }
  // custom
  const start = customStart || fmt(anchor);
  const end = customEnd || start;
  return { start, end, label: `${start} to ${end}` };
}

// Matches a YYYY-MM-DD (or longer ISO timestamp) field against a range.
export function isDateInRange(dateStr: string | undefined | null, range: ReportRange): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= range.start && d <= range.end;
}

// Matches a YYYY-MM month field (StaffProvidentFund.month, DriverEmployee.month,
// FuelLog.period) against a range by whether that calendar month overlaps it
// at all - used for the modules whose records are month-granular rather than
// day-dated.
export function isMonthInRange(monthStr: string | undefined | null, range: ReportRange): boolean {
  if (!monthStr) return false;
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return false;
  const monthStart = `${monthStr}-01`;
  const monthEnd = fmt(new Date(y, m, 0));
  return monthStart <= range.end && monthEnd >= range.start;
}
