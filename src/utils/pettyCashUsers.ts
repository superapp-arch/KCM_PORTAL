// The 3 real Petty Cash logins - single source of truth shared by every
// place that needs to name or pick one of them: Petty Cash's own Balance Net
// user picker (PettyCash.tsx), Fuel Management's "Petty Cash Paid By"
// dropdown for Extra Fuel (FuelManagement.tsx), and the server-side link
// that auto-creates a Petty Cash voucher for petty-cash-paid Extra Fuel
// (server.ts's syncFuelExtraPettyCashLink). Update the list here only - every
// caller reads from this one array instead of keeping its own copy.
export const PETTY_CASH_USERS: { username: string; label: string }[] = [
  { username: 'vinoda', label: 'Vinod' },
  { username: 'ramesh', label: 'Ramesh' },
  { username: 'saneel', label: 'Saneel' }
];
