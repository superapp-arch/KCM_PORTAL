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
  fileData?: string; // base64 payload or preview placeholder
}

export interface Vehicle {
  id?: string;
  regNo?: string;
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
  regNo: string;
  date: string;
  quantity: number; // in Litres
  rate: number;
  amount: number;
  odometer: number;
  slipNo: string;
  filledBy: string;
  documents?: VehicleDocument[];
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
  vehicleNumber: string; // Vehicle number
  receiver: string; // Manual receiver text
  vendorId: string; // Vendor ID
  amountReceived: number; // Amount received
  cashPaid: number; // Cash paid
  balance: number; // Balance (amountReceived - cashPaid)
  tripSheet: string; // Trip sheet info
  remarks: string; // Remarks
  documents?: VehicleDocument[];
}

export interface MaintenanceRecord {
  id: string;
  regNo: string;
  date: string;
  serviceType: 'Scheduled Servicing' | 'Breakdown Repair' | 'Parts Replacement';
  description: string;
  cost: number;
  garageName: string;
  documents?: VehicleDocument[];
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

export interface HREmployee {
  id: string;
  name: string;
  role: 'Driver' | 'Vehicle Manager' | 'Billing Clerk' | 'Finance Officer' | 'Admin Support';
  licenseNo?: string;
  licenseExpiry?: string;
  salary: number;
  attendanceStatus: 'Present' | 'On Leave' | 'Absent';
  status: 'Active' | 'Inactive';
  documents?: VehicleDocument[];
  dailyAttendance?: Record<string, 'Present' | 'Absent' | 'On Leave'>;
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
  type: 'security' | 'insurance' | 'permit' | 'general';
  timestamp: string;
  read: boolean;
  vehicleRegNo?: string;
}

export interface DriverSalary {
  id: string;
  driverId: string;
  driverName: string;
  accountNumber: string;
  ifscCode: string;
  netSalary: number;
  remarks?: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
  documents?: VehicleDocument[];
}

export interface DriverSalaryAuditLog {
  id: string;
  timestamp: string;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  driverId: string;
  driverName: string;
  details: string;
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
  openingKm: number;
  closingKm: number;
  totalKm: number;
  ratePerLitre: number;
  litres: number;
  dieselAmount: number;
  mileage: number;
  driverName: string;
  location: string;
  remarks: string;
  actualMileage: number;
  documents?: VehicleDocument[];
}


