// Display names for the "Entered By" filter/column shared by Fuel
// Management and Mileage Report (2026-09-04) - both stamp the logged-in
// username server-side into FuelLog.enteredBy/MileageReport.enteredBy; this
// just makes that value (and the Excel-style "isolate just this person's
// rows" filter dropdown) readable, same convention as PettyCash's own
// PETTY_CASH_USERS. Falls back to the raw username for anyone not listed
// here.
export const FUEL_ENTERED_BY_LABELS: Record<string, string> = {
  chandanreddy: 'Chandan Reddy',
  praveenkumar: 'Praveen Kumar',
  ramesh: 'Ramesh',
  vinoda: 'Vinod'
};

export const fuelEnteredByLabel = (username: string) => FUEL_ENTERED_BY_LABELS[username] || username;
