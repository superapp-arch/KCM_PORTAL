export type DepartmentType =
  | 'vehicle_manager'
  | 'fuel_management'
  | 'billing'
  | 'petty_cash'
  | 'maintenance'
  | 'accounts_finance'
  | 'hr'
  | 'administration'
  | 'super_admin';

export interface User {
  username: string;
  name: string;
  department: DepartmentType;
  departmentLabel: string;
  email?: string;
}

export interface VehicleDocument {
  id: string;
  name: string; // e.g., "License", "Insurance", "FC", "Tax Invoice"
  type: 'pdf' | 'image' | 'other';
  fileName: string;
  fileSize: string;
  uploadDate: string;
  filePath?: string; // relative path under /uploads, served statically - used by new uploads
  fileData?: string; // base64 payload - legacy documents saved before server-side upload existed
}

export interface Vehicle {
  id?: string;
  regNo?: string;
  active?: boolean; // Employee-toggled status; undefined/missing is treated as active
  type?: string;
  category?: string;
  ownership?: string;
  model?: string;
  regYear?: string;
  regDate?: string;
  chassisNo?: string;
  tax?: string;
  emissionTest?: string;
  fc?: string;
  insurance?: string;
  allIndiaPermit?: string;
  statePermit?: string;
  engineNo?: string;
  vehicleIdvAmount?: string;
  gvwKgs?: string;
  unladenWeightKgs?: string;
  insuranceCompany?: string;
  policyNo?: string;
  premiumAmount?: string;
  remarks?: string;
  accidentDate?: string;
  accidentTime?: string;
  accidentPlace?: string;
  driverName?: string;
  driverLicenseNo?: string;
  claimNumber?: string;
  policeFirNo?: string;
  firDate?: string;
  policeStationAddress?: string;
  accidentIncidentDetails?: string;
  claimAmount?: string;
  documents?: VehicleDocument[];

  // Mixed case fallback support for initial seed data and dynamic endpoints
  "SI No"?: number;
  "Reg. No."?: string;
  "Type"?: string;
  "Category"?: string;
  "Ownership"?: string;
  "Model"?: string;
  "Reg Year"?: string;
  "Reg Date"?: string;
  "Chassis No"?: string;
  "Tax"?: string;
  "Emission Test"?: string;
  "FC"?: string;
  "Insurance"?: string;
  "All India Permit"?: string;
  "State permit"?: string;
  "Engine No"?: string;
  "GVW in Kgs"?: string;
  "Unloaden Weight in Kgs"?: string;
  "Insurance Company Name"?: string;
  "Policy No"?: string;
  "Premium Amount"?: string;
  "Driver Name"?: string;
  "Driver License No"?: string;
  "Claim Number"?: string;
  "Police FIR No"?: string;
  "FIR Date"?: string;
  "Police Station Address"?: string;
  "Accident Incident Details"?: string;
  "Claim Amount"?: string;
  [key: string]: any;
}

export interface FuelLog {
  id: string;
  entryNumber: number; // auto-generated, sequential
  period: string; // YYYY-MM - billing/statement month
  date: string; // YYYY-MM-DD - exact fill-up day
  location: string;
  bunkName: string;
  bunkOrCard: 'Bunk' | 'Card';
  vehicleNumber: string; // autofetched from Fleet, manual entry allowed if not found
  indentNumber: string;
  ltrs: number;
  rate: number;
  amount: number; // auto = ltrs * rate, editable override
  client: string;
  type: 'Vendor' | 'KCM';
  vendorName?: string; // from Vendor Master, searchable
  vendorCode?: string; // auto-filled from matched vendor
  remarks?: string;
  requestedBy?: string;
  rqId?: string;
  documents?: VehicleDocument[];
  enteredBy?: string; // username, stamped server-side; visible only to super admins
  // Links this fuel purchase to the mileage/trip entry it was combined with
  // in the Fuel Entry form's "Mileage" section (see MileageReport) - lets
  // editing/deleting a fuel entry also update/cascade-delete its linked
  // mileage report. Absent on fuel entries that never had mileage data.
  mileageReportId?: string;
}

// Vendor Master for Fuel Entry's Vendor Name/Vendor Code fields. Starts empty;
// vendors are added one at a time via the Fuel Entry tab's "Add Vendor" form.
export interface FuelVendor {
  id: string;
  name: string;
  code: string;
}

// Vehicle Mileage Master: a fixed KM/L rating per vehicle, set once and reused
// by every Trip Details entry for that vehicle - replaces the old per-entry
// odometer-derived mileage calculation.
export interface VehicleMileage {
  id: string;
  vehicleNo: string;
  mileage: number;
}

// Vendor Management: a full KYC/bank registry, separate from the lightweight
// FuelVendor name+code list used inside Fuel Entry's "Manage Vendors" panel.
// Fuel Entry has read-only lookup access to this list (by vendor name) to
// auto-fill/select the vendor's registered vehicle(s), but the module itself
// (and its Aadhar/PAN/bank fields) is restricted to Divya, Rakshina, and
// Super Admins.
export interface Vendor {
  id: string;
  name: string;
  code: string;
  active?: boolean; // employee-toggled status; undefined/missing is treated as active
  // A vendor can now be contracted under any number of clients, freely typed
  // (not limited to a fixed list) - stored as an array going forward.
  // `string` is kept in the union only because older saved records still
  // hold a single legacy value - always read this via getVendorClients() in
  // VendorManagement.tsx rather than directly.
  client?: string[] | string;
  vehicleNumbers: string[]; // at least one; a vendor may have multiple vehicles
  contactNumber: string; // exactly 10 digits
  aadharNumber: string; // exactly 12 digits
  panNumber: string; // exactly 10 characters
  bankAccountNumber: string;
  ifscCode: string;
  aadharDocuments: VehicleDocument[]; // mandatory, at least one file
  panDocuments: VehicleDocument[]; // mandatory, at least one file
  rcDocuments: VehicleDocument[]; // mandatory, at least one file
  bankStatementDocuments: VehicleDocument[]; // mandatory, at least one file
}

export interface BillingInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
  description: string;
  documents?: VehicleDocument[];
}

export interface PettyCashVoucher {
  id: string;
  date: string; // YYYY-MM-DD
  entryNo: string; // Entry number
  category: string; // Expense category
  location: string; // Manual location text
  clientName: string; // swiggy, RIL F&V, market load, etc.
  vendor: 'kcm insta' | 'kcm supply' | string; // kcm insta, kcm supply
  vehicleNumber: string; // Vehicle number - from Fleet & Vehicles master
  vendorVehicleNumber?: string; // Separate vendor-owned vehicle number - from Vendor Management's registered vehicleNumbers, not Fleet & Vehicles
  receiver: string; // Manual receiver text
  vendorId: string; // Vendor ID
  amountReceived: number; // Amount received
  cashPaid: number; // Cash paid
  balance: number; // Balance (amountReceived - cashPaid)
  tripSheet: string; // Trip sheet info
  remarks: string; // Remarks
  documents?: VehicleDocument[];
  enteredBy?: string; // username, stamped server-side; row-level-filtered to the 3 Petty Cash logins, visible only to super admins
}

// One-off (or top-up) cash-advance entry for a Petty Cash user's running
// Balance Net ledger (see PettyCash.tsx). Never overwritten - a later
// top-up for the same user is a new row, not an edit of the old one.
export interface PettyCashAdvance {
  id: string;
  username: string; // the Petty Cash login this advance belongs to
  amount: number;
  date: string; // YYYY-MM-DD
  remarks?: string;
}

export type MarketPodStatus = 'Pending' | 'Closed';

// How this trip's Extra Trip amount was paid. "Cash" auto-routes that amount
// into the Petty Cash Dashboard's "Cash" tab, tagged with this entry's date;
// "Petty Cash" needs no extra routing (accounted normally). Defaults to
// "Petty Cash" for entries saved before this field existed.
export type MarketPodPaymentMode = 'Cash' | 'Petty Cash';

// A freight trip ledger nested inside the Petty Cash module ("Market POD"
// tab). Entry No is auto-generated/sequential (see nextMarketPodEntryNo in
// PettyCash.tsx) and never user-editable. Balance is always derived -
// totalFreight - receivedAdvance - otherExpenses - never entered manually.
export interface MarketPodEntry {
  id: string;
  entryNo: string; // auto e.g. "TRIP-000001", not editable
  vehicleNumber: string; // from Fleet & Vehicles master; unmatched numbers are auto-registered there on save
  date: string; // YYYY-MM-DD
  from: string;
  to: string;
  customer: string; // manual entry
  totalFreight: number;
  receivedAdvance: number;
  otherExpenses: number;
  balance: number; // auto = totalFreight - receivedAdvance - otherExpenses
  coordinator: string; // manual text entry, no dropdown
  status: MarketPodStatus;
  remarks: string;
  driverId?: string; // auto-fetched from Driver Details (DriverEmployee.id) by matching vehicleNumber; read-only except for super admin override
  paymentMode?: MarketPodPaymentMode;
  extraTripAmount?: number; // separate ad-hoc/extra-trip amount, distinct from the regular freight fields above - this is what routes to the Cash tab when paymentMode is "Cash"
  enteredBy?: string; // username, stamped server-side; row-level-filtered to the 3 Petty Cash logins, visible only to super admins
}

// A single line item within a maintenance visit (item 10: costs must be
// traceable to what was actually done, not one lump sum per visit).
export interface MaintenanceWorkItem {
  description: string;
  cost: number;
}

export interface MaintenanceRecord {
  id: string;
  regNo: string;
  date: string;
  serviceType: 'Scheduled Servicing' | 'Breakdown Repair' | 'Parts Replacement' | 'Electrical Repair';
  description: string;
  cost: number; // legacy lump-sum field; once workItems is set, this is always the computed sum of workItems - kept for old records saved before workItems existed
  workItems?: MaintenanceWorkItem[]; // per-work-item costing for this visit
  garageName: string; // legacy free-text; new entries prefer serviceStationId
  serviceStationId?: string; // from the Authorised Service Station master (MaintenanceServiceStation)
  driverName?: string; // who was driving/responsible for the vehicle at the time of this service
  driverId?: string; // auto-fetched from Driver Details when driverName matches exactly one registered driver; manual entry allowed otherwise
  breakdownReportId?: string; // links this record back to the BreakdownReport it resolves, when logged as a Workshop Visit
  documents?: VehicleDocument[];
}

// Authorised Service Station master list - Service Station is a dropdown of
// these, not free text, to keep it standardized.
export interface MaintenanceServiceStation {
  id: string;
  name: string;
}

// One record per vehicle (id = Reg. No.) holding maintenance data that
// belongs to the vehicle itself rather than to any one service visit -
// warranty, tyres, wheel alignment, battery, and the tools checklist.
export interface VehicleMaintenanceProfile {
  id: string; // Reg. No.
  regNo: string;
  warrantyStatus: 'Under Warranty' | 'Non-Warranty';
  // Service due-soon/overdue is computed from the vehicle's last
  // MaintenanceRecord date/odometer plus whichever of these is set - see
  // computeServiceDueStatus in src/utils/maintenanceDates.ts. Either or both
  // may be left blank if that vehicle isn't tracked that way.
  serviceIntervalDays?: number;
  serviceIntervalKm?: number;
  serviceLastOdometerKm?: number; // odometer reading at the last service, as a baseline for the KM interval - set manually or from the last MaintenanceRecord
  wheelAlignmentLastDate?: string; // YYYY-MM-DD
  wheelAlignmentIntervalDays?: number;
  wheelAlignmentIntervalKm?: number;
  wheelAlignmentLastOdometerKm?: number; // odometer reading at the last alignment
  batteryNumber?: string;
  tyres: { brand: string; kmRun: number; position?: string }[];
  // Seeded with Jack / Jack Rod / Tommy Bar / Spanner but freely extensible -
  // "add more if applicable".
  toolsChecklist: { name: string; present: boolean }[];
}

// A vehicle breaking down at a location, reported before (or without) a
// repair having happened yet. Once a Workshop Visit (MaintenanceRecord with
// breakdownReportId set) is logged against it, status flips to Resolved.
export interface BreakdownReport {
  id: string;
  regNo: string;
  date: string;
  location: string;
  description: string;
  driverName?: string;
  driverId?: string;
  status: 'Open' | 'Resolved';
  workshopVisitId?: string; // the MaintenanceRecord.id that resolved this breakdown
}

export interface AccountsEntry {
  id: string;
  date: string;
  type: 'Income' | 'Expense';
  category: string;
  amount: number;
  reference: string;
  documents?: VehicleDocument[];
}

export type StaffOrgUnit = 'KCM_SUPPLY' | 'KCM_INSTA';

export interface StaffEmployee {
  id: string; // EmpId, e.g. KCM15001 or KCMI30001
  name: string;
  designation?: string;
  dateOfJoining?: string; // free-text dd/mm/yyyy, entered manually (no date picker)
  dateOfLeaving?: string; // free-text dd/mm/yyyy; setting this prompts the UI to also set status to Inactive
  location?: string; // defaults to "Bangalore" in the UI
  status: 'Active' | 'Inactive';
  orgUnit: StaffOrgUnit; // server-derived from EmpId prefix (^KCMI\d+ -> Insta, else Supply); read-only in the UI
  employmentType?: 'On-Roll' | 'Contract';
  contactNumber?: string; // exactly 10 digits
  aadharNumber?: string; // exactly 12 digits
  panNumber?: string; // exactly 10 characters
  remarks?: string;
  documents?: VehicleDocument[]; // "Other Documents" - unlimited
  aadharDocuments?: VehicleDocument[]; // mandatory in the UI, limited to one file
  panDocuments?: VehicleDocument[]; // mandatory in the UI, limited to one file
}

export interface StaffSalaryDetail {
  id: string;
  empId: string;
  ctc25?: number;
  annualCtc25?: number;
  advanceAmount?: number; // total advance taken from the company; reduced by StaffAdvanceDeduction rows
  remarks?: string;
}

// Salary hikes modeled as rows (not columns) so a new hike cycle is just a new
// row instead of a schema change - StaffSalaryDetail.EffectiveSalary is CTC25
// plus every hike whose effectiveDate has passed, computed on read.
export interface StaffSalaryHike {
  id: string;
  empId: string;
  effectiveDate: string; // YYYY-MM-DD
  amount: number;
}

// One deduction entry per month against an employee's advance - rows-based
// (like StaffSalaryHike) so the balance and full deduction history are always
// derivable: balance = StaffSalaryDetail.advanceAmount - sum(these amounts).
export interface StaffAdvanceDeduction {
  id: string;
  empId: string;
  date: string; // YYYY-MM-DD
  amount: number;
}

// Monthly payroll breakdown per employee - one record per empId+month.
// totalDays/workingDays/lopDays are intentionally NOT stored here; they're
// always read live from attendance (see StaffAttendanceAdjustment for the
// manual LOP override), consistent with how attendance summaries elsewhere
// are computed rather than persisted.
// "Salary Breakup" (formerly labeled Provident Fund). perDaySalary,
// extraDaysAmount, and lopAmount are intentionally NOT stored here - they're
// always computed on read from the fields below plus attendance, exactly
// like totalDays/workingDays/lopDays, so attendance and salary stay linked
// without any manual re-entry or sync bugs:
//   perDaySalary = (basic+hra+conveyance+medicalAllowance+lta+cca+fuelAllowance+otherAllowances) / 30.5
//   extraDaysAmount = extraDays * perDaySalary
//   lopAmount = lopDays (from attendance, or its manual override) * perDaySalary
export interface StaffProvidentFund {
  id: string; // deterministic: `${empId}-${month}`
  empId: string;
  month: string; // YYYY-MM
  // Earnings
  basic?: number;
  hra?: number;
  conveyance?: number;
  medicalAllowance?: number;
  lta?: number;
  cca?: number;
  fuelAllowance?: number;
  otherAllowances?: number;
  extraDays?: number; // count of extra days worked; amount is computed (extraDays * perDaySalary)
  // Deductions (lopAmount is computed, not stored - see above)
  professionalTax?: number;
  epf?: number;
  esi?: number;
  fullAndFinal?: number;
  otherDeductions?: number;
  advances?: number;
  incomeTax?: number;
}

// Lets HR manually override the attendance-derived LOP day count for a given
// employee/month (e.g. to waive or adjust LOP), set from the attendance
// summary modal. When present, this wins over the auto-counted LOP days
// everywhere LOP is shown/used (summary modal, Provident Fund tab).
export interface StaffAttendanceAdjustment {
  id: string; // deterministic: `${empId}-${month}`
  empId: string;
  month: string; // YYYY-MM
  lopDaysOverride?: number;
}

export interface StaffBankDetail {
  id: string;
  empId: string;
  accountNumber?: string; // masked to last 4 digits in the UI by default
  ifscCode?: string;
  bankName?: string;
  amount?: number;
}

export type AttendanceStatusCode =
  | 'Present'
  | 'AbsentNoInfo'
  | 'AbsentLOP'
  | 'PaidLeave'
  | 'LeaveWithPermission'
  | 'HalfDay'
  | 'MedicalLeave'
  | 'Holiday'
  | 'WeekOff';

export interface StaffAttendance {
  id: string;
  empId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatusCode;
  remarks?: string;
}

export interface StaffHoliday {
  id: string;
  date: string;
  name: string;
}

export interface AbnormalLogin {
  id: string;
  timestamp: string;
  username: string;
  ipAddress: string;
  reason: string;
  resolved: boolean;
}

export interface DashboardNotification {
  id: string;
  title: string;
  message: string;
  type: 'security' | 'insurance' | 'permit' | 'fc' | 'tax' | 'general';
  timestamp: string;
  read: boolean;
  vehicleRegNo?: string;
}

export interface WarehouseEntry {
  id: string;
  slNo: number;
  date: string;
  warehouseName: string;
  warehouseCity: string;
  vehicleNumber: string;
  vehicleType: 'tata ace' | 'bolero' | 'tata 407' | '14ft' | '17ft' | '20ft' | '22ft' | '32ft' | string;
  vehicleCategory: 'dry' | 'reefer' | 'hybrid' | 'walkes' | string;
  deploymentType: 'regular' | 'ad-hoc' | 'hybrid' | string;
  pod: string;
  podCity: string;
  fixedHours: 12 | 24 | number;
  kmSlab: string;
  openingKm: number;
  closingKm: number;
  inTime: string;
  closureTime: string;
  kmUtilised: number;
  hoursDaysAsPerContract: number;
  overtimeVehicle: string;
  extraKm: number;
  baseRate: number;
  fuelCost: number;
  finalBaseRate: number;
  additionalKmCost: number;
  additionalHourCost: number;
  tollCharges: number;
  parkingCost: number;
  hybridReeferCost: number;
  grandTotal: number;
  vendorRemarks: string;
  documents?: VehicleDocument[];
}

export interface MileageReport {
  id: string;
  slNo: number;
  date: string;
  vehicleNo: string;
  openingKm: number; // required - real odometer reading, feeds totalKm
  closingKm: number; // required - real odometer reading, feeds totalKm
  totalKm: number; // Distance Covered, = closingKm - openingKm
  ratePerLitre: number;
  litres: number;
  dieselAmount: number;
  mileage: number; // computed per trip = totalKm / litres (the REAL achieved efficiency this trip)
  costPerKm?: number; // auto = ratePerLitre / mileage
  driverName: string; // UI label "Authorized Driver" - supports multiple names, e.g. "Suresh / Adhithya"
  driverId?: string; // auto-fetched from Driver Details (DriverEmployee.id) when Authorized Driver matches exactly one registered driver; manual entry allowed for drivers not yet registered
  location: string;
  remarks: string;
  actualMileage: number; // FIXED per-vehicle reference, looked up from the Vehicle Mileage Master (src/db/schema.ts: vehicleMileage) by vehicleNo - not manually typed
  difference?: number; // auto, in LITRES = (totalKm / actualMileage) - litres; positive (green, +) = fuel saved, negative (red, -) = fuel wasted
  fuelAuditNote?: string; // auto-generated advisory text appended to remarks when difference is non-zero - informational only, no payroll record created
  extraFuel?: number;
  ratePerLitreNew?: number; // rate applied to extraFuel in the Total Amount calc
  totalAmount?: number; // auto = dieselAmount + (extraFuel * ratePerLitreNew)
  documents?: VehicleDocument[];
  enteredBy?: string; // username, stamped server-side; visible only to super admins
}

// Driver Details module - a driver-focused counterpart to HR & Payroll.
// Access is location-scoped (see server.ts: DRIVER_LOCATION_SCOPES) rather
// than a single fixed group - each regional handler only sees/manages
// drivers in their assigned location(s); Super Admins see everything.
export type DriverLocationCategory =
  | 'HSK RIL F&V Drivers'
  | 'Market Vehicle Driver Details'
  | 'Belgaum Drivers Details'
  | 'Vijayawada Drivers Details'
  | 'Swiggy - Vizag Driver'
  | 'Hyd Swiggy'
  | 'Walkes & Parking Drivers HYD'
  | 'BLR Swiggy'
  | 'Cold Star BLR'
  | 'Goa Vehicle'
  | 'Chennai Hybrid'
  | 'Nelmangala Reliance'
  | 'Nidaghatta Reliance'
  | 'Swiggy DHL'
  | 'KCM Service Station';

export const DRIVER_LOCATION_CATEGORIES: DriverLocationCategory[] = [
  'HSK RIL F&V Drivers', 'Market Vehicle Driver Details', 'Belgaum Drivers Details',
  'Vijayawada Drivers Details', 'Swiggy - Vizag Driver', 'Hyd Swiggy',
  'Walkes & Parking Drivers HYD', 'BLR Swiggy', 'Cold Star BLR', 'Goa Vehicle',
  'Chennai Hybrid', 'Nelmangala Reliance', 'Nidaghatta Reliance', 'Swiggy DHL', 'KCM Service Station'
];

// "Sl.No" is a display-only row index, not persisted. "Wages Per Day" and
// "Total" are pure computed/derived values (like HR's Per Day Salary/Net
// Salary) - not stored. lopAmount IS stored as a snapshot (recomputed from
// attendance + wagesPerDay whenever the driver record is saved).
export interface DriverEmployee {
  id: string; // Driver ID*, e.g. KCMDRV19102
  name: string; // Driver Name*
  driverNo: string; // 10-digit mobile, optional
  vehicleNo?: string;
  accountNumber?: string; // A/C No
  ifscCode?: string;
  reporting?: string;
  remark?: string;
  lopAmount?: number; // snapshot = LOP day-count (for `month`) x Wages Per Day
  pettyCashAdvance?: number;
  month?: string; // YYYY-MM - which month the salary figures apply to
  loanDeduction?: number;
  recoveryAmount?: number;
  driverWelfare?: number;
  bata?: number;
  otherAdditions?: number; // added to Gross Salary (see Payable Amount formula)
  grossSalary?: number;
  location: DriverLocationCategory;
  aadharDocuments?: VehicleDocument[]; // optional
  drivingLicenseDocuments?: VehicleDocument[]; // optional
  otherDocuments?: VehicleDocument[];
}

export interface DriverAttendance {
  id: string; // deterministic: `${driverId}-${date}`
  driverId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatusCode;
  remarks?: string;
}

export type LoanStatus = 'Active' | 'Closed';
export type NOCStatus = 'Received' | 'Not received';

export const VEHICLE_LOAN_FINANCERS = [
  'Axis Bank', 'Axis Bank-Citi', 'HDFC Bank Ltd', 'ICICI Bank', 'Kotak Mahindra Bank', 'Sundaram Finance'
];

// One record per vehicle (id = Reg. No.), shared between the Loan Management
// module's Vehicle Loan ledger and Fleet & Vehicles' EMI Details tab - both
// read/write the same record so there's no duplicate entry. Months Completed,
// Balance EMI, and Due Date are always computed live from emiStartDate (see
// src/utils/loanDates.ts) - never stored, so they can never go stale.
export interface VehicleLoan {
  id: string; // Reg. No.
  ownership?: string;
  regNo: string;
  financer: string;
  financeNumber?: string;
  loanAmount?: number;
  emiStartDate?: string; // YYYY-MM-DD
  monthlyEmi?: number;
  tenure?: number; // months
  interest?: number; // %
  loanStatus: LoanStatus;
  // true only when an employee explicitly picked a Loan Status that
  // disagrees with the auto-computed one (e.g. forcing Active despite EMI
  // Pending being 0, for a payment/amount dispute) - see resolveLoanStatus in
  // loanDates.ts. Absent/false means loanStatus is always kept in sync with
  // the auto-computed value and can never go stale.
  loanStatusManual?: boolean;
  remarks?: string; // e.g. closing month/year once Closed
  nocStatus?: NOCStatus;
  documents?: VehicleDocument[];
}

// EMI Paid, Balance EMI, and Due Date are always computed live from emiDate
// (see src/utils/loanDates.ts) - never stored.
export interface BusinessLoan {
  id: string;
  financer: string;
  loanType: string;
  loanNumber: string;
  sanctionedAmount?: number;
  emiDate?: string; // YYYY-MM-DD
  emiMonthly?: number;
  tenure?: number;
  interestRate?: number; // %
  loanStatus: LoanStatus;
  // See VehicleLoan.loanStatusManual - same meaning.
  loanStatusManual?: boolean;
  remarks?: string;
}


