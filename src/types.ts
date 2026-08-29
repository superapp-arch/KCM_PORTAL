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
  // Legacy field - no longer read anywhere. The Ledger's Type badge is now
  // fully determined by Source: every Petty Cash-sourced row (this table)
  // displays as Debit, every Market Trip credit row displays as Credit -
  // never a per-voucher choice. Kept only so old rows/exports that stored a
  // value here don't lose it; new saves always write 'debit'.
  transactionType?: 'debit' | 'credit';
  // Marks a voucher auto-created by another module rather than typed by hand
  // in Petty Cash - currently only Fuel Management's petty-cash-paid Extra
  // Fuel (see server.ts's syncFuelExtraPettyCashLink). Drives the Ledger's
  // Source badge and the "generated from Fuel Management - edit the linked
  // Fuel Entry instead" edit/delete guard in both PettyCash.tsx and
  // server.ts. Absent for every ordinary manually-logged entry.
  source?: 'fuel-management';
  // The MileageReport this entry was generated from (see MileageReport.
  // pettyCashEntryId, the reverse pointer) - only set alongside source =
  // 'fuel-management'. One report -> at most one voucher: the deterministic
  // id `fuel-pc-<mileageReportId>` is upserted, never duplicated.
  mileageReportId?: string;
}

// One-off (or top-up) cash-advance entry for a Petty Cash user's running
// Balance Net ledger (see PettyCash.tsx). Never overwritten - a later
// top-up for the same user is a new row, not an edit of the old one.
// `source`/`marketPodEntryId` mark one auto-generated from a Market POD trip
// (Payment Mode = Petty Cash) rather than manually logged by the user - see
// server.ts's syncMarketPodPettyCashLinks. Auto ones use a deterministic id
// (`mp-adv-<tripId>` / `mp-bal-<tripId>-<receiptId>`) so they can be
// found-and-updated or found-and-deleted again without needing a separate
// link field on the trip itself.
export interface PettyCashAdvance {
  id: string;
  username: string; // the Petty Cash login this advance belongs to
  amount: number;
  date: string; // YYYY-MM-DD
  remarks?: string;
  source?: 'market-pod-advance' | 'market-pod-balance';
  marketPodEntryId?: string;
  // Which company account this top-up actually came from - only meaningful
  // for a manually-logged advance (source absent); a market-pod-sourced one
  // has no account concept of its own. Shown in the Ledger's merged Credit
  // row (see PettyCash.tsx) in the same Vendor column real vouchers already
  // use for this same kcm insta/kcm supply distinction.
  account?: 'kcm insta' | 'kcm supply';
}

export type MarketPodStatus = 'Pending' | 'Closed';

// How this trip's money was paid. When "Petty Cash": the Received Advance,
// plus any Balance Settlement receipts (see MarketPodBalanceReceipt), flow
// automatically into the Petty Cash module's Total Received Float as real
// PettyCashAdvance rows (source: 'market-pod-advance'/'market-pod-balance') -
// identical treatment to a manually logged Amount Received entry in every
// calculation. "Cash" (displayed as "Company Account" - see
// PAYMENT_MODE_LABELS in PettyCash.tsx) does not touch the float at all.
// Defaults to "Petty Cash" for entries saved before this field existed.
// "Vinod Account" is a third settlement option, same "doesn't touch the
// Petty Cash float" treatment as "Cash" - selectable only by Vinod and
// Super Admins (see PettyCash.tsx's own payment mode dropdown).
export type MarketPodPaymentMode = 'Cash' | 'Petty Cash' | 'Vinod Account';

// One partial (or full) receipt against a trip's Balance (see
// MarketPodEntry.balanceReceipts) - supports settling in more than one
// payment (e.g. ₹1,500 today, ₹500 later) rather than an all-or-nothing flag.
export interface MarketPodBalanceReceipt {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

// A freight trip ledger nested inside the Petty Cash module ("Market POD"
// tab). Entry No is auto-generated/sequential (see nextMarketPodEntryNo in
// PettyCash.tsx) and never user-editable. Balance is always derived -
// totalFreight - receivedAdvance - otherExpenses - never entered manually.
export interface MarketPodEntry {
  id: string;
  entryNo: string; // auto e.g. "TRIP-000001", not editable
  vehicleNumber: string; // typically from Fleet & Vehicles master, but free text is allowed - never auto-registers there (Fleet & Vehicles is the sole source of truth, only ever added to directly)
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
  paymentMode?: MarketPodPaymentMode; // 'Cash' displays as "Company Account" in the UI (PAYMENT_MODE_LABELS) - the stored value itself is unchanged, for old records/reports
  extraTripAmount?: number; // [Deprecated] separate ad-hoc/extra-trip amount, distinct from the regular freight fields above - no longer editable from the Add/Edit Market POD Trip form (its dashboard "Cash tab" destination was removed), kept only so existing records don't lose this figure
  enteredBy?: string; // username, stamped server-side; row-level-filtered to the 3 Petty Cash logins, visible only to super admins
  // Balance Settlement (separate from the auto-calculated Balance above,
  // which stays untouched) - tracks the outstanding trip balance actually
  // being paid/received after the trip completes, possibly in more than one
  // partial receipt. Status is derived (never stored): no receipts yet =
  // Pending, received < balance = Partially Received, received >= balance =
  // Received.
  balanceReceipts?: MarketPodBalanceReceipt[];
  // Snapshot of totalFreight/receivedAdvance/balance taken at the moment the
  // FIRST balance receipt was recorded - if a later edit changes any of
  // those figures, comparing against this snapshot is how the UI detects
  // and flags the mismatch (see point 2's "flag rather than silently
  // recalculate a settled amount" rule) instead of ever adjusting a
  // settled amount on its own.
  balanceSettledSnapshot?: { totalFreight: number; receivedAdvance: number; balance: number };
}

// A single line item within a maintenance visit (item 10: costs must be
// traceable to what was actually done, not one lump sum per visit).
export interface MaintenanceWorkItem {
  description: string;
  cost: number;
  type?: 'Spare' | 'Labour'; // itemised category shown on the Service Invoice; optional so records saved before this field existed still render fine (listed with a blank Type)
}

export interface MaintenanceRecord {
  id: string;
  regNo: string;
  date: string;
  time?: string; // HH:MM the work order was actually raised - defaults to "now" on new entries but stays editable; this (not today's system date/time) is what the Service Invoice header is built from
  serviceType: 'Scheduled Servicing' | 'Breakdown Repair' | 'Parts Replacement' | 'Electrical Repair' | 'Tire Service' | 'Battery Service' | 'Tools Check';
  description: string;
  cost: number; // legacy lump-sum field; once workItems is set, this is always the computed sum of workItems - kept for old records saved before workItems existed
  workItems?: MaintenanceWorkItem[]; // per-work-item costing for this visit
  garageName: string; // legacy free-text; new entries prefer serviceStationId
  serviceStationId?: string; // from the Authorised Service Station master (MaintenanceServiceStation)
  odometer?: number; // auto-fetched from Mileage Report's latest Closing KM for regNo when the work order was raised; kept editable since Mileage Report may not be updated yet for a brand-new entry
  invoiceNumber?: string; // denormalized copy of the linked ServiceInvoiceRecord.invoiceNumber for quick display in the ledger table - source of truth is still ServiceInvoiceRecord
  driverName?: string; // who was driving/responsible for the vehicle at the time of this service
  driverId?: string; // auto-fetched from Driver Details when driverName matches exactly one registered driver; manual entry allowed otherwise
  breakdownReportId?: string; // links this record back to the BreakdownReport it resolves, when logged as a Workshop Visit
  documents?: VehicleDocument[];
  // username, stamped server-side on create only (never overwritten by a
  // later edit) - Fleet Maintenance is a shared team ledger, so unlike Fuel/
  // Petty Cash/Market POD/Mileage this never restricts which ROWS a viewer
  // sees, only whether the enteredBy field itself is included; server strips
  // it out for anyone who isn't a Super Admin.
  enteredBy?: string;
}

// Authorised Service Station master list - Service Station is a dropdown of
// these, not free text, to keep it standardized.
export interface MaintenanceServiceStation {
  id: string;
  name: string;
}

// [Deprecated] One record per vehicle (id = Reg. No.) holding maintenance
// data that belongs to the vehicle itself - warranty, tyres, wheel
// alignment, battery, and the tools checklist. Superseded by the
// VehicleServiceSchedule / TireRecord / BatteryRecord / ToolsChecklistRecord
// split below (Fleet Maintenance rebuild). The type, DB table, and API route
// are kept only so migrateLegacyMaintenanceProfiles() in src/db/service.ts
// can do a one-time read of any pre-existing rows on upgrade - no UI reads or
// writes this anymore.
export interface VehicleMaintenanceProfile {
  id: string; // Reg. No.
  regNo: string;
  warrantyStatus: 'Under Warranty' | 'Non-Warranty';
  serviceIntervalDays?: number;
  serviceIntervalKm?: number;
  serviceLastOdometerKm?: number;
  wheelAlignmentLastDate?: string; // YYYY-MM-DD
  wheelAlignmentIntervalDays?: number;
  wheelAlignmentIntervalKm?: number;
  wheelAlignmentLastOdometerKm?: number;
  batteryNumber?: string;
  tyres: { brand: string; kmRun: number; position?: string }[];
  toolsChecklist: { name: string; present: boolean }[];
}

// One row per vehicle (id = Reg. No.) tracking its scheduled-service
// interval and warranty. CurrentOdometerKm is never stored here - it's
// always read live from Fuel Management's latest Closing KM (see
// latestOdometerFor in src/utils/maintenanceDates.ts) and combined with
// lastServiceKm/serviceIntervalKm at render/alert time to get ServiceStatus.
export interface VehicleServiceSchedule {
  id: string; // Reg. No.
  regNo: string;
  // General record shown on the Vehicle Service Schedule tab itself - no
  // longer drives a km-based cycle/Cycle Alert (that UI was removed; the
  // Washing and AC Service tabs below are the two real fixed-cycle
  // registers now). serviceIntervalKm/lastServiceKm are kept only so
  // pre-existing data isn't lost - nothing computes from them anymore.
  lastServiceDate?: string; // YYYY-MM-DD
  lastServiceKm?: number;
  serviceIntervalKm: number; // default 10,000 km
  // Manual Completed/Pending flag for the Vehicle Service Schedule tab's own
  // Service Status column - no longer derived from km remaining.
  serviceStatus?: 'Completed' | 'Pending';
  // The status the office has recorded (e.g. voided early, or genuinely
  // still under the manufacturer's warranty). This is a FLOOR only in the
  // "OutOfWarranty" direction - computeWarrantyStatus() in maintenanceDates.ts
  // can force InWarranty -> OutOfWarranty once the vehicle crosses 3,00,000 km
  // or 3 years from its Fleet & Vehicles Registration Date (whichever first),
  // but never forces OutOfWarranty back to InWarranty automatically.
  warrantyStatus: 'InWarranty' | 'OutOfWarranty';
  warrantyExpiryDate?: string; // optional manual tracking, nullable
  warrantyExpiryKm?: number; // optional manual tracking, nullable
  remarks?: string;

  // --- Washing tab (Walkes/Reefer/Hybrid, fixed 10-day cycle, 2-day-before
  // reminder - see WASHING_CYCLE_DAYS/WASHING_CATEGORIES in
  // utils/vehicleCycleDefaults.ts). Next Due = lastWashingDate + 10 days,
  // defaulting to today when lastWashingDate is unset (a never-yet-washed
  // vehicle still shows a live preview instead of a blank dash).
  lastWashingDate?: string; // YYYY-MM-DD
  washingStatus?: 'Completed' | 'Pending';
  // --- AC Service tab (Hybrid/Reefer only, fixed 40-day cycle, 2-day-before
  // reminder - see AC_SERVICE_CYCLE_DAYS/AC_SERVICE_CATEGORIES). A separate
  // date from lastServiceDate above - AC servicing is its own maintenance
  // activity, not the same event as a general/odometer-based service.
  lastAcServiceDate?: string; // YYYY-MM-DD
  acServiceStatus?: 'Completed' | 'Pending';

  // Retired - cycleDays/reminderDays used to let each vehicle override the
  // (also now-retired) combined Service Due/Washing Due cycle. The Washing
  // and AC Service tabs above use fixed, non-configurable cycle lengths
  // instead. Kept only so any previously-saved value can still be read;
  // nothing writes to them anymore.
  cycleDays?: number;
  reminderDays?: number[];
  // Snapshot of the previous value every time lastServiceDate/lastServiceKm,
  // lastWashingDate, or lastAcServiceDate is changed and saved - newest
  // first. Purely a display history; the cycle math only ever reads the
  // current date fields above.
  serviceHistory?: { date: string; km?: number }[];
  washingHistory?: { date: string }[];
  acServiceHistory?: { date: string }[];
}

// Fleet Maintenance > Service Schedule's Vehicle Maintenance Reference
// lookup (2026-08-29) - a separate, independent reference dataset from
// VehicleServiceSchedule above (imported from an existing external tracking
// sheet, own field conventions and all - e.g. Warranty Period is a single
// free-text value like "300000/3 YEAR", not the structured warrantyExpiryKm/
// warrantyExpiryDate pair above). Vehicle No is the primary key; Reg Date/
// Vehicle Type/Model are NOT duplicated here - those stay sourced live from
// Fleet & Vehicles (see FleetSheet.tsx's own Vehicle records) and are locked/
// read-only wherever this reference is shown, exactly as before.
export interface VehicleMaintenanceReference {
  vehicleNo: string; // primary key - matches Fleet & Vehicles' own Reg. No.
  responsible?: string;
  lastServiceDoneKm?: number;
  warrantyPeriod?: string; // free text, e.g. "300000/3 YEAR" - not a structured km/date pair
  servicePeriod?: number; // km interval, e.g. 40000
  updatedAt?: string; // ISO timestamp, stamped server-side on every upsert
}

// Retired - Service Schedule's Service Due/Washing Due cycle lengths and
// reminder-day thresholds used to be a single global row edited from an
// Alert Settings panel, then briefly a fixed-per-category default with a
// per-vehicle override (VehicleServiceSchedule.cycleDays/reminderDays).
// Both are superseded by the Washing/AC Service tabs' own fixed cycles (see
// WASHING_CYCLE_DAYS/AC_SERVICE_CYCLE_DAYS in utils/vehicleCycleDefaults.ts).
// This type, its DB table, and the /api/alert-settings routes are kept only
// so any previously-saved row can still be read; nothing writes to it anymore.
export interface AlertSettings {
  id: string; // fixed singleton id, see DEFAULT_ALERT_SETTINGS
  reeferHybridServiceCycleDays: number; // default 40
  reeferHybridReminderDays: number[]; // default [15, 7, 3]
  walkesWashingCycleDays: number; // default 15
  walkesReminderDays: number[]; // default [7, 5, 3]
}

// A downloadable PDF invoice/slip generated from one Garage Work Order
// (MaintenanceRecord) - one invoice per work order, same "resolve or
// generate" spirit as SalarySlipRecord. Auto-numbered (KCM-YYYY-NNNN,
// sequential) only when the work order's Authorised Service Station is
// exactly "KCM Service Station"; for every other (external) station,
// invoiceNumber is whatever the handler typed manually into the work
// order's own Invoice Number field, and isAutoNumbered is false.
export interface ServiceInvoiceRecord {
  id: string; // = maintenanceRecordId - one invoice per work order
  maintenanceRecordId: string;
  invoiceNumber: string;
  isAutoNumbered: boolean; // true only for KCM Service Station work orders
  regNo: string;
  workOrderDate: string; // YYYY-MM-DD, copied from the work order's own Date field (not today's date)
  workOrderTime?: string; // HH:MM, copied from the work order's own Time field
  vehicleModel?: string; // auto-fetched from Fleet & Vehicles at generation time
  vehicleOwnership?: string; // auto-fetched from Fleet & Vehicles at generation time
  odometer?: number; // copied from the work order's Odometer field
  garageName: string;
  serviceStationId?: string;
  workItems: MaintenanceWorkItem[];
  totalAmount: number;
  paidAmount?: number;
  nextServiceDueNote?: string; // computed from VehicleServiceSchedule at generation time, e.g. "Next service due at 45,000 km"
  generatedDate: string; // YYYY-MM-DD - when the PDF/slip was actually generated, distinct from workOrderDate
  generatedTime?: string; // HH:MM
  pdfUrl?: string; // /uploads/service-invoices/... - same generic upload endpoint every other module's documents already use
  isDownloaded?: boolean;
  lastDownloadedDate?: string;
}

export interface ServiceInvoiceAuditRecord {
  id: string;
  invoiceNumber: string;
  maintenanceRecordId: string;
  regNo: string;
  action: 'Generated' | 'Regenerated' | 'Downloaded';
  timestamp: string;
  performedBy?: string; // username
}

// Tire Brand master list for the Tire Configuration Brand dropdown - a
// simple ordered lookup (BrandId/BrandName/DisplayOrder), not free text.
// Apollo/MRF/JK Tyre/Bridgestone are seeded with displayOrder 1-4 fixed at
// the top; every brand added afterward (via the dropdown's "Add new
// brand..." option) is appended with the next integer, in the order added -
// never alphabetized, never inserted between existing entries.
export interface TireBrand {
  id: string;
  name: string;
  displayOrder: number;
}

// One row per tyre position per vehicle. AlignmentStatus/NextAlignmentDueKm
// are always computed (see computeAlignmentStatus in maintenanceDates.ts),
// never stored - NextAlignmentDueKm = lastAlignmentKm + ALIGNMENT_INTERVAL_KM
// (fixed 10,000 km, not configurable per spec).
export interface TireRecord {
  id: string;
  regNo: string;
  position: string; // e.g. "Front Left", "Rear Right Outer" - free text, axle configs vary by vehicle type
  tireBrand: string; // Company/Brand - required, selected from the TireBrand master list
  tireSerialNumber?: string;
  installedDate?: string;
  installedKm?: number;
  lastAlignmentKm?: number;
  // Replacement history (Bulk Tire Entry): when a tire at a position is
  // replaced, the old row is kept with isCurrent set false and its
  // removed*/ fields filled, rather than being overwritten - same
  // history-via-flag convention as BatteryRecord.isCurrent. Absent on
  // legacy rows saved before this existed - always treat missing/undefined
  // as current (isCurrent !== false), never as "not current".
  isCurrent?: boolean;
  removedDate?: string;
  removedKm?: number; // odometer (Closing KM) at the time this tire was taken off
}

// One row per battery ever fitted to a vehicle - a history, not just the
// current one. Exactly one row per regNo should have isCurrent true.
export interface BatteryRecord {
  id: string;
  regNo: string;
  batteryNumber: string;
  make?: string;
  installedKm?: number;
  installedDate?: string;
  warrantyExpiryDate?: string; // nullable
  isCurrent: boolean;
}

// One row per tools check performed (a dated log, not a single always-current
// state) - CheckDate, CheckedBy, and the 4 fixed tool flags per spec.
export interface ToolsChecklistRecord {
  id: string;
  regNo: string;
  checkDate: string;
  hasJack: boolean;
  hasJackRod: boolean;
  hasTommyBar: boolean;
  hasSpanner: boolean;
  checkedBy?: string;
  remarks?: string;
}

// Fleet Maintenance > Service Station > Spare Parts tab - one row per part
// consumed against a vehicle. `regNo` (not a separate vehicle_id) matches
// this codebase's own convention for a vehicle reference on a maintenance
// log row (see TireRecord/BatteryRecord/ToolsChecklistRecord above) - it's
// always populated from a Vehicle dropdown (Fleet & Vehicles' live list),
// never free-typed, so it always resolves back to a real vehicle.
export interface ServiceStationSparePart {
  id: string;
  date: string;
  regNo: string;
  partName: string;
  partNumber: string;
  qty: number;
}

// Fleet Maintenance > Service Station > Inspection tab - one row per
// inspection performed. Same regNo convention as ServiceStationSparePart
// above.
export interface ServiceStationInspection {
  id: string;
  date: string;
  regNo: string;
  details: string;
  status: 'Completed' | 'Pending';
  inspectedBy?: string;
}

// A vehicle breaking down (Type: EnRouteBreakdown), a scheduled/unscheduled
// WorkshopVisit, or an ElectricalProblem - reported before (or without) a
// repair having happened yet. Once a Workshop Visit (MaintenanceRecord with
// breakdownReportId set) is logged against it, status flips to Resolved.
export interface BreakdownReport {
  id: string;
  regNo: string;
  type: 'EnRouteBreakdown' | 'WorkshopVisit' | 'ElectricalProblem';
  date: string;
  location: string;
  description: string;
  driverName?: string;
  driverId?: string;
  paymentType?: string; // e.g. Cash / Credit / Company Paid - free text, no fixed master list requested
  amount?: number;
  documents?: VehicleDocument[];
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
  dateOfBirth?: string; // YYYY-MM-DD, via DateInput (displays dd/mm/yyyy) - source of truth for the Birthday Reminder job (server.ts)
  email?: string; // registered email - the Birthday Reminder wish goes here; also usable for other future employee-facing notifications
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
  // Draft (default) until HR explicitly finalizes via its own action in the
  // Salary Breakup tab, separate from the regular Save - Salary Slip
  // generation only proceeds without a warn-and-confirm when this is
  // 'Finalized'. Editing/re-saving other fields afterward does not revert
  // this back to Draft.
  status?: 'Draft' | 'Finalized';
}

// One row per generated payslip (id = slipNumber). Everything below is a
// point-in-time SNAPSHOT taken at generation - a later edit to Basic Info,
// Bank Details, or the source StaffProvidentFund record never retroactively
// changes a slip that's already been issued.
export interface SalarySlipRecord {
  id: string; // = slipNumber
  slipNumber: string; // SLIP-YYYYMM-NNN, auto-generated, sequential within that month
  empId: string;
  month: string; // YYYY-MM
  employeeName: string;
  department: string; // = the employee's Designation field - HR's own convention (Basic Info has no separate Department field)
  bankAccountNumberMasked?: string; // last 4 digits only, same masking convention as the Bank Details tab
  bankName?: string;
  ifscCode?: string;
  // Earnings/deductions snapshot from the StaffProvidentFund record used.
  basic?: number; hra?: number; conveyance?: number; medicalAllowance?: number;
  lta?: number; cca?: number; fuelAllowance?: number; otherAllowances?: number;
  extraDays?: number; extraDaysAmount?: number;
  professionalTax?: number; epf?: number; esi?: number; fullAndFinal?: number;
  otherDeductions?: number; advances?: number; incomeTax?: number;
  lopDays?: number; lopAmount?: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  generatedDate: string; // YYYY-MM-DD
  pdfUrl?: string; // /uploads/salary-slips/... - same generic upload endpoint every other module's documents already use
  isDownloaded?: boolean;
  lastDownloadedDate?: string;
}

export interface SalarySlipAuditRecord {
  id: string;
  slipNumber: string;
  empId: string;
  month: string;
  action: 'Generated' | 'Regenerated' | 'Downloaded';
  timestamp: string;
  performedBy?: string; // username
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
  // username, stamped server-side every time this specific employee+date
  // cell is marked/re-marked - always reflects whoever most recently set
  // *this* day's status (each cell is its own record, same convention as
  // DriverAttendance.markedBy). Server strips it out for anyone who isn't a
  // Super Admin.
  markedBy?: string;
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
  type: 'security' | 'insurance' | 'permit' | 'fc' | 'tax' | 'general' | 'service-due' | 'alignment-due' | 'birthday' | 'washing-due' | 'ac-service-due';
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
  // AM/PM for inTime/closureTime (2026-08-29) - only meaningful for a 12Hr
  // deployment (a 24Hr one has no shift start/end at all, see fixedHours);
  // absent on entries saved before this existed. Together with inTime/
  // closureTime, this is what lets the shift duration be told apart from a
  // trip that crosses midnight (e.g. 08:00 PM in to 08:00 AM out = 12h
  // overnight, not a 0h/negative one).
  inTimePeriod?: 'AM' | 'PM';
  closureTime: string;
  closureTimePeriod?: 'AM' | 'PM';
  kmUtilised: number;
  hoursDaysAsPerContract: number;
  // Retired - overtime is now captured via addHour/additionalHourCost below
  // instead of a separate Yes/No field. Kept only so already-saved entries
  // still show their original value in reports/exports; the Add/Edit forms
  // no longer have an input for it.
  overtimeVehicle: string;
  extraKm: number; // "Add KM" - km run beyond kmSlab, manually entered
  baseRate: number; // auto-computed (see scheduledRate/workingDays below) - kept manually editable for pre-existing records saved before this existed
  fuelCost: number; // auto = baseRate * FUEL_COST_PERCENT (see utils/warehouseRates.ts) - same backward-compat note as baseRate
  finalBaseRate: number;
  additionalKmCost: number; // auto = extraKm * ratePerExtraKm
  additionalHourCost: number; // auto = addHour * ratePerExtraHour
  tollCharges: number;
  parkingCost: number;
  hybridReeferCost: number;
  grandTotal: number;
  vendorRemarks: string;
  documents?: VehicleDocument[];

  // --- Rate-calculation inputs, saved alongside the computed results above
  // so a past record's Base Rate/Fuel Cost/Grand Total still reconciles even
  // after the Scheduled Rate, per-km/per-hour rates, or fuel % config
  // changes later - the record carries the exact inputs used at the time,
  // not just the output. All optional so pre-existing entries (saved before
  // this system existed) are unaffected and keep showing their own already-
  // stored baseRate/fuelCost/etc above untouched.
  scheduledRate?: number; // fixed monthly rate Base Rate (12 Hrs) divides by Working Days
  workingMonth?: string; // YYYY-MM the Working Days calendar was computed for
  workingDaysAuto?: number; // calendar days in workingMonth, minus Sundays/holidays per the flags below
  deductSundays?: boolean;
  holidaysCount?: number;
  workingDaysOverride?: number; // set only when the user overrides the auto-computed Working Days ("Reset to auto" clears this)
  workingDays?: number; // the value actually used in the formula = workingDaysOverride ?? workingDaysAuto (>= 1, never 0)
  ratePerExtraKm?: number; // Rs per km beyond kmSlab - multiplies extraKm into additionalKmCost
  addHour?: number; // "Add Hour" - hours run beyond fixedHours, manually entered
  ratePerExtraHour?: number; // Rs per hour beyond fixedHours - multiplies addHour into additionalHourCost
  variableCostPerKm?: number; // 24 Hrs only - Rs/km term in the 24 Hrs Base Rate formula
  // Deprecated - the 24Hr Base Rate formula's Variable Cost term now
  // multiplies against kmUtilised (Closing KM - Opening KM) directly, not a
  // separately-entered "KM per Day". Kept only so already-saved entries from
  // before this change still show their original stored value in
  // reports/exports; the Add/Edit forms no longer have inputs for these.
  kmPerDayAuto?: number;
  kmPerDayOverride?: number;
  kmPerDay?: number;
  // 12Hr Dedicated fixed Scheduled Rate lookup (see utils/warehouseRateMatrix.ts)
  // - one of WAREHOUSE_GROUP_OPTIONS' values, e.g. "BLR IM2" or "Vizag".
  // Also reused for the 24Hr Dedicated lookup (utils/warehouseRateMatrix24hr.ts,
  // BLR only for now) - same "which rate group matched" concept either way.
  // Only meaningful/used when a group has a rate configured for the chosen
  // Vehicle Type (+ KM Slab for 12Hr); otherwise scheduledRate above is
  // manually typed exactly as before. Purely a fixed in-code lookup table
  // for now, not a database-backed/admin-editable one.
  warehouseGroup?: string;
  // Ad-hoc 24Hr only - the From City/To City selected for the round-trip
  // route-table lookup that replaces KM Slab/Working Days/Scheduled Rate for
  // this Deployment Type (see utils/warehouseRateMatrix24hr.ts). Undefined
  // for every other Deployment Type/Fixed Hrs combination.
  adHocFromCity?: string;
  adHocToCity?: string;
}

// Warehouse Details > Rates - editable overrides on top of the fixed
// in-code rate tables (utils/warehouseRateMatrix.ts/warehouseRateMatrix24hr.ts)
// (2026-08-29). One generic shape covers every rate "kind" rather than a
// separate table per kind, since they're all really the same thing: some
// dimensions (Warehouse Group/Vehicle Type/KM Slab/Location) identifying
// which cell, and a value. Super Admin only (see RatesSummary.tsx) - a
// lookup function checks these first and only falls back to the hardcoded
// default when no override exists for that exact combination, so this is
// purely additive: nothing here changes anything until someone actually
// edits or adds a rate through the Rates tab.
export type WarehouseRateOverrideKind = 'scheduled12hr' | 'extra12hr' | 'dedicated24hr' | 'reeferWalkes24hr';

export interface WarehouseRateOverride {
  id: string; // deterministic composite key, e.g. "scheduled12hr:ecomHyd:207:2000" - doubles as the upsert key
  kind: WarehouseRateOverrideKind;
  // Dimension values identifying the cell, kind-specific:
  // scheduled12hr: { group, vehicleType, kmSlab }; extra12hr: { group, vehicleType };
  // dedicated24hr: { group, vehicleType }; reeferWalkes24hr: { location, vehicleKey }
  dims: Record<string, string>;
  // The actual rate figure(s), kind-specific:
  // scheduled12hr: { rate }; extra12hr: { extraKm, extraHr };
  // dedicated24hr: { fixed, variable }; reeferWalkes24hr: { fc, vc }
  value: Record<string, number>;
  updatedAt?: string; // stamped server-side on every upsert
  enteredBy?: string; // username, stamped server-side; visible only to super admins
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
  litres: number; // the main fill-up only - see totalLitres below for what mileage/cost/audit actually use
  dieselAmount: number;
  // Total fuel actually consumed this trip = litres + extraFuel (e.g. a
  // Bangalore->Mysore run that top-ups mid-route AND again near the
  // destination) - mileage/costPerKm/the fuel-theft audit below are all
  // computed off THIS, not the bare `litres` field, since a mid-trip top-up
  // is real fuel used. Optional only for pre-existing rows saved before this
  // field existed; falls back to `litres` (extraFuel treated as 0) when
  // absent - see the one-time backfill migration in db/service.ts.
  totalLitres?: number;
  mileage: number; // computed per trip = totalKm / totalLitres (the REAL achieved efficiency this trip)
  costPerKm?: number; // auto = ratePerLitre / mileage
  driverName: string; // UI label "Authorized Driver" - supports multiple names, e.g. "Suresh / Adhithya"
  driverId?: string; // auto-fetched from Driver Details (DriverEmployee.id) when Authorized Driver matches exactly one registered driver; manual entry allowed for drivers not yet registered
  location: string;
  remarks: string;
  actualMileage: number; // FIXED per-vehicle reference, looked up from the Vehicle Mileage Master (src/db/schema.ts: vehicleMileage) by vehicleNo - not manually typed
  difference?: number; // auto, in LITRES = (totalKm / actualMileage) - totalLitres; positive (green, +) = fuel saved, negative (red, -) = fuel wasted
  fuelAuditNote?: string; // auto-generated advisory text appended to remarks when difference is non-zero - informational only, no payroll record created
  // Accepts a sum-of-numbers expression when typed in the UI (e.g. "30+40"
  // for two separate top-ups) - always stored here as the already-evaluated
  // total (70), never the raw expression text.
  extraFuel?: number;
  ratePerLitreNew?: number; // rate applied to extraFuel in the Total Amount calc
  // auto = dieselAmount + (extraFuel * ratePerLitreNew) - EXCEPT when
  // extraFuelPaymentMode is 'petty_cash' below, where it's dieselAmount only
  // (the extra fuel's cost lives entirely in the linked Petty Cash voucher
  // instead, so it isn't double-counted here). totalLitres follows the same
  // rule: litres only, not litres+extraFuel, when petty-cash-paid.
  totalAmount?: number;
  // "Paid by Petty Cash" for Extra Fuel (see FuelManagement.tsx's Mileage
  // tab) - undefined/'normal' (the default) is today's original behavior
  // (extraFuel folds into totalLitres/totalAmount above). 'petty_cash' means
  // this specific top-up was paid out of a Petty Cash handler's float
  // instead of the normal fuel/vendor account: extraFuel/ratePerLitreNew
  // stay stored as-is (still shown on this record, plus a "(PC)"/holder
  // badge - see FuelManagement.tsx and MileageReport.tsx), and totalLitres/
  // totalAmount exclude them. Deliberately does NOT create/sync any linked
  // Petty Cash entry - showing the badge is enough, per direct instruction.
  extraFuelPaymentMode?: 'normal' | 'petty_cash';
  // Which of the 3 Petty Cash logins (see utils/pettyCashUsers.ts) this
  // extra fuel is charged against - required whenever extraFuelPaymentMode
  // is 'petty_cash'. Display-only (the "(PC) - Ramesh" badge); does not
  // affect any Petty Cash balance.
  pettyCashHolderUsername?: string;
  // Legacy - a linked-voucher mechanism that used to exist here was removed;
  // never populated by new saves. Kept only so old rows that already have a
  // value don't lose it.
  pettyCashEntryId?: string;
  documents?: VehicleDocument[];
  enteredBy?: string; // username, stamped server-side; visible only to super admins
}

// Diesel Payments module (2026-08-29 rework) - a running per-bunk account,
// NOT a period/cycle-based statement. Each bunk (Bunk Name + Location, both
// pulled straight from Fuel Management's own FuelLog.bunkName/location -
// the same identity Fuel Management's own Bunk Summary panel already groups
// by) has ONE continuous ledger: the balance only ever moves on a purchase
// (increases what's owed) or a payment (reduces it), and carries forward
// indefinitely - it never resets on a calendar/period boundary. Supersedes
// BunkPaymentPeriod/BunkPayment below, which the module no longer reads or
// writes (kept only so any pre-existing rows aren't silently deleted).
export interface DieselBunkAccount {
  id: string;
  bunkName: string;
  location: string; // same bunk name can exist at more than one location (e.g. HPCL at BLR/Chennai/Goa) - each is its own account
  openingBalance: number; // signed - negative means KCM owes this bunk money as of when this account was created; 0 for a brand-new bunk with no starting balance to carry in
  // Per-bunk High/Pending/Clear exposure threshold (₹ currently owed) -
  // falls back to DEFAULT_HIGH_EXPOSURE_THRESHOLD (see Payments.tsx) when
  // unset, so every bunk still gets a sensible badge without having to
  // configure this on day one.
  highExposureThreshold?: number;
}

// A manual payment logged against a DieselBunkAccount. Purchases are
// deliberately NOT stored as rows anywhere - they're computed live from
// Fuel Management's own FuelLog rows for this bunk's (bunkName, location)
// (see Payments.tsx's purchasesFor), so editing or deleting a fuel entry
// there automatically updates this bunk's balance/history here too, with no
// separate sync step to ever forget or get wrong. Payments themselves are
// never overwritten - settling across Cash/Card/Netbanking or multiple
// installments is just more rows against the same bunkId.
export interface DieselBunkPayment {
  id: string;
  bunkId: string; // FK -> DieselBunkAccount.id
  date: string; // YYYY-MM-DD
  amount: number; // always positive - overpayment is allowed, no cap against the outstanding balance
  mode: 'cash' | 'card' | 'netbanking';
  reference?: string; // transaction ID/note - mandatory for card/netbanking (enforced in the form and server-side), optional for cash
  // username, stamped server-side - visible only to Super Admins/Principal
  // (department === 'super_admin'), same maskAttributionField treatment
  // server.ts already applies to FuelLog.enteredBy.
  enteredBy?: string;
}

// [Deprecated 2026-08-29] Period/cycle-based predecessor of the Diesel
// Payments module above - superseded by DieselBunkAccount/DieselBunkPayment.
// No longer read or written by Payments.tsx; kept only so any rows already
// saved under this scheme aren't silently deleted from the database.
export interface BunkPaymentPeriod {
  id: string;
  bunkName: string;
  location: string;
  periodFrom: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
  enteredBy?: string;
}

// [Deprecated 2026-08-29] See BunkPaymentPeriod above.
export interface BunkPayment {
  id: string;
  bunkPeriodId: string; // FK -> BunkPaymentPeriod.id
  amount: number;
  mode: 'card' | 'cash' | 'netbanking';
  paidDate: string; // YYYY-MM-DD
  enteredBy?: string;
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

// Minimal, company-wide vehicle -> driver lookup for modules outside Driver
// Details that need to auto-match a vehicle to its driver (e.g. Petty Cash's
// Market POD trip form) regardless of the caller's own Driver Details
// location scope - see /api/drivers/vehicle-lookup. Deliberately excludes
// every payroll/bank/document field DriverEmployee carries. One row per
// (driver, vehicle) pair, not per driver - a driver covering several
// vehicles (DriverEmployee.vehicleNos) appears once per vehicle, and a
// vehicle assigned to more than one driver naturally yields more than one
// row with the same vehicleNo - callers matching by vehicle number should
// expect (and handle) more than one match rather than assuming exactly one.
export interface DriverVehicleLookup {
  id: string;
  name: string;
  vehicleNo: string;
}

// "Sl.No" is a display-only row index, not persisted. "Wages Per Day" and
// "Total" are pure computed/derived values (like HR's Per Day Salary/Net
// Salary) - not stored. lopAmount IS stored as a snapshot (recomputed from
// attendance + wagesPerDay whenever the driver record is saved).
export interface DriverEmployee {
  id: string; // Driver ID*, e.g. KCMDRV19102
  name: string; // Driver Name*
  driverNo: string; // 10-digit mobile, optional
  vehicleNo?: string; // deprecated - kept in sync as vehicleNos[0] for old readers (e.g. Driver Attendance's caption) that only ever needed "a" vehicle to show; vehicleNos below is the source of truth
  vehicleNos?: string[]; // a driver can legitimately cover more than one vehicle - see DriverFormModal's Vehicle No chips
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
  otherAdditions?: number; // added to Gross Earned (see Payable Amount formula in utils/driverSalaryExport.ts)
  grossSalary?: number;
  // Snapshot of Working Days (Present + Paid Leave) for `month`, taken the
  // moment Salary Breakup was last saved - needed because Payable Amount now
  // pro-rates Gross Salary by Working Days (Gross Earned = Gross Salary /
  // No. of Days x Working Days) rather than paying the full month regardless
  // of attendance, and a static driver record has no other way to know that
  // month's attendance once it's no longer the current month. Absent on any
  // driver saved before this field existed - see driverSalaryExport.ts's
  // payableAmount() for the fallback (treats the whole month as worked,
  // reproducing that record's pre-fix Payable Amount exactly).
  workingDays?: number;
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
  // username, stamped server-side every time this specific driver+date cell
  // is marked/re-marked (each cell is its own record, so - unlike a flat
  // ledger's enteredBy - this always reflects whoever most recently set
  // *this* day's status, not just who first created the row). Server strips
  // it out for anyone who isn't a Super Admin.
  markedBy?: string;
}

// A downloadable payslip for one driver over an arbitrary date range (not
// necessarily a full calendar month - e.g. a driver who only worked 15 days)
// - same "resolve or generate" spirit as HR & Payroll's SalarySlipRecord, but
// keyed by dateFrom/dateTo instead of a fixed month. Earned pay is always
// pro-rated: Wages Per Day (driver's monthly Gross Salary ÷ days in that
// month) x days actually Present/Paid-Leave within the range - LOP days
// within the range are simply excluded from that count (0 pay), not
// subtracted a second time, so lopAmount below is informational only.
// Month-based, same spirit as HR & Payroll's SalarySlipRecord - a frozen
// snapshot of whatever's already been entered in Salary Breakup (Driver
// Salary's own "Salary" tab: Gross Salary, Other Additions, deductions) for
// this driver/month, combined with that month's live attendance summary
// (Present + Paid Leave, LOP days) the exact same way Salary Breakup's own
// Wages Per Day / LOP Amount / Payable Amount are computed - so the slip and
// the Salary Breakup tab can never disagree. Nothing is entered manually
// inside the slip itself; it only ever reflects what's already saved.
export interface DriverSalarySlipRecord {
  id: string; // = slipNumber
  slipNumber: string; // DRVSLIP-YYYYMM-NNN, auto-generated, sequential within that month
  driverId: string;
  driverName: string;
  vehicleNo?: string;
  location: DriverLocationCategory;
  month: string; // YYYY-MM
  bankAccountNumberMasked?: string; // last 4 digits only, same masking convention as HR's Salary Slip
  ifscCode?: string;
  totalDays: number; // days in this calendar month
  presentDays: number; // Present + Paid Leave (salaryWorkingDays) for the month
  lopDays: number;
  exemptionLeaveDays: number;
  grossSalary?: number; // snapshot from Salary Breakup - the full, un-prorated monthly figure (kept for reference; wagesPerDay/grossEarned below are what actually feed netSalary)
  wagesPerDay: number; // grossSalary / totalDays
  grossEarned: number; // wagesPerDay x presentDays - the pro-rated amount actually earned for days worked
  lopAmount: number; // wagesPerDay x lopDays
  otherAdditions?: number;
  pettyCashAdvance?: number;
  loanDeduction?: number;
  recoveryAmount?: number;
  driverWelfare?: number;
  bata?: number;
  totalEarnings: number; // grossEarned + otherAdditions
  totalDeductions: number; // pettyCashAdvance + loanDeduction + recoveryAmount + driverWelfare + bata
  netSalary: number; // totalEarnings - totalDeductions - lopAmount, matching Salary Breakup's Payable Amount formula exactly (see utils/driverSalaryExport.ts's computeDriverEarnings)
  generatedDate: string; // YYYY-MM-DD
  pdfUrl?: string; // /uploads/driver-salary-slips/... - same generic upload endpoint every other module's documents already use
  isDownloaded?: boolean;
  lastDownloadedDate?: string;
}

export interface DriverSalarySlipAuditRecord {
  id: string;
  slipNumber: string;
  driverId: string;
  month: string;
  action: 'Generated' | 'Regenerated' | 'Downloaded';
  timestamp: string;
  performedBy?: string; // username
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

// Audit Trail - see src/db/schema.ts's auditLogs table and
// src/db/service.ts's createAuditLog/getAuditLogs. Do not force every module
// to use every action - use whichever actually describes what happened.
export type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT'
  | 'EXPORT' | 'IMPORT' | 'PASSWORD_CHANGE' | 'ROLE_CHANGE' | 'ACCESS_DENIED' | 'OTHER';

export interface AuditLog {
  id: string;
  createdAt: string; // IST "YYYY-MM-DD HH:mm:ss" - see auth/time.ts's istTimestamp()
  userId?: string; // acting user's username - absent for events with no resolvable session
  userName?: string;
  userRole?: string; // department at the time of the action
  action: AuditAction;
  module: string; // e.g. "Fleet & Vehicles", "Fuel Management" - reuses this app's own module names
  entityType?: string; // e.g. "Vehicle", "Fuel Entry"
  entityId?: string;
  description: string;
  oldData?: string; // JSON string, already redacted before storage - see db/auditRedact.ts
  newData?: string; // JSON string, already redacted before storage
  ipAddress?: string;
  userAgent?: string;
}


