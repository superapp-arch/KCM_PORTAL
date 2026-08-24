import { db } from './index.ts';
import {
  users,
  vehicles,
  fuelLogs,
  billingInvoices,
  pettyCashVouchers,
  maintenanceRecords,
  accountsEntries,
  staffEmployees,
  staffSalaryDetails,
  staffSalaryHikes,
  staffAdvanceDeductions,
  staffProvidentFund,
  staffAttendanceAdjustments,
  staffBankDetails,
  staffAttendance,
  staffHolidays,
  alertSettings,
  salarySlips,
  salarySlipAudits,
  driverSalarySlips,
  driverSalarySlipAudits,
  serviceInvoices,
  serviceInvoiceAudits,
  abnormalLogins,
  notifications,
  warehouseEntries,
  mileageReports,
  fuelVendors,
  vehicleMileage,
  vendors,
  driverEmployees,
  driverAttendance,
  vehicleLoans,
  businessLoans,
  marketPodEntries,
  pettyCashAdvances,
  vehicleMaintenanceProfiles,
  maintenanceServiceStations,
  breakdownReports,
  vehicleServiceSchedules,
  tireBrands,
  tireRecords,
  batteryRecords,
  toolsChecklistRecords,
  auditLogs
} from './schema.ts';
import { eq, ne, and, or, ilike, gte, lte, asc, desc, sql } from 'drizzle-orm';
import { hashPassword, isHashed } from '../auth/password.ts';
import { istTimestamp } from '../auth/time.ts';
import { redactSensitive } from './auditRedact.ts';
import {
  User,
  Vehicle,
  FuelLog,
  BillingInvoice,
  PettyCashVoucher,
  MaintenanceRecord,
  AccountsEntry,
  StaffEmployee,
  StaffSalaryDetail,
  StaffSalaryHike,
  StaffAdvanceDeduction,
  StaffProvidentFund,
  StaffAttendanceAdjustment,
  StaffBankDetail,
  StaffAttendance,
  StaffHoliday,
  AlertSettings,
  SalarySlipRecord,
  SalarySlipAuditRecord,
  DriverSalarySlipRecord,
  DriverSalarySlipAuditRecord,
  ServiceInvoiceRecord,
  ServiceInvoiceAuditRecord,
  AbnormalLogin,
  DashboardNotification,
  WarehouseEntry,
  MileageReport,
  FuelVendor,
  VehicleMileage,
  Vendor,
  DriverEmployee,
  DriverAttendance,
  VehicleLoan,
  BusinessLoan,
  MarketPodEntry,
  PettyCashAdvance,
  VehicleMaintenanceProfile,
  MaintenanceServiceStation,
  BreakdownReport,
  VehicleServiceSchedule,
  TireBrand,
  TireRecord,
  BatteryRecord,
  ToolsChecklistRecord,
  AuditLog,
  AuditAction
} from '../types.ts';

// Default Users Seed
export const DEFAULT_USERS = [
  { username: 'anand', name: 'Anand.N', department: 'super_admin', departmentLabel: 'Super Administration', email: 'anand.n@kcmlogistics.in', pass: 'KCM@anand852' },
  { username: 'chethan', name: 'Chethan KK', department: 'super_admin', departmentLabel: 'Super Administration', email: 'chethan@kcmlogistics.in', pass: 'KCM@chethan419' },
  { username: 'chandana', name: 'Chandana LN', department: 'vehicle_manager', departmentLabel: 'Vehicle Data Manager', email: 'ln.chandana@kcmlogistics.in', pass: 'KCM@chandana923' },
  { username: 'divya', name: 'Divya', department: 'billing', departmentLabel: 'Billing Dept', email: 'divya@kcmlogistics.in', pass: 'KCM@divya741' },
  { username: 'bhagya', name: 'Bhagya S', department: 'billing', departmentLabel: 'MIS & Billing / HR Admin', email: 'bhagya@kcmlogistics.in', pass: 'KCM@bhagya308' },
  { username: 'praveenkumar', name: 'Praveen Kumar DP', department: 'fuel_management', departmentLabel: 'Fuel Management', email: 'praveenkumar@kcmlogistics.in', pass: 'KCM@praveen652' },
  { username: 'chandanreddy', name: 'Chandan Reddy', department: 'fuel_management', departmentLabel: 'Fuel Management', email: 'chandanreddy@kcmlogistics.in', pass: 'KCM@chandan580' },
  { username: 'vinoda', name: 'Vinoda', department: 'petty_cash', departmentLabel: 'Petty Cash Desk', email: 'vinod@kcmlogistics.in', pass: 'KCM@vinod194' },
  { username: 'ramesh', name: 'Ramesh', department: 'petty_cash', departmentLabel: 'Petty Cash Desk', email: 'ramesh@kcmlogistics.in', pass: 'KCM@ramesh273' },
  { username: 'shashi', name: 'Shashi', department: 'maintenance', departmentLabel: 'Maintenance Garage', email: 'shashikumar@kcmlogistics.in', pass: 'KCM@shashi642' },
  { username: 'saneel', name: 'Saneel', department: 'maintenance', departmentLabel: 'Maintenance Garage', email: 'saneel@kcmlogistics.in', pass: 'KCM@saneel105' },
  { username: 'rajeshwar', name: 'Rajeshwar', department: 'maintenance', departmentLabel: 'Maintenance Garage', email: 'rajeshwar@kcmlogistics.in', pass: 'KCM@rajeshwar498' },
  { username: 'rakshina', name: 'Rakshina', department: 'accounts_finance', departmentLabel: 'Accounts & Finance', email: 'finance@kcmlogistics.in', pass: 'KCM@finance337' },
  { username: 'nagaraju', name: 'Nagaraju Linga', department: 'maintenance', departmentLabel: 'Driver Coordination', email: 'nagaraju.linga@kcmlogistics.in', pass: 'KCM@nagaraju471' },
  { username: 'hemanth', name: 'Hemanth', department: 'maintenance', departmentLabel: 'Maintenance Garage', email: 'hemanth@kcmlogistics.in', pass: 'KCM@hemanth729' },
  { username: 'super2', name: 'Super Admin Principal', department: 'super_admin', departmentLabel: 'Super Administration', email: 'superapp@kcmlogistics.in', pass: 'super123' },
];

const initialVehicles = [
  {
    "SI No": 1,
    "Reg. No.": "KA403973",
    "Type": "tata ace",
    "Category": "dry",
    "Ownership": "kcm supply",
    "Model": "TATA Ace",
    "Reg Year": "2008",
    "Reg Date": "08.02.2008",
    "Chassis No": "445010CRZV1134",
    "Tax": "LTT",
    "Emission Test": "-",
    "FC": "02.09.2026",
    "Insurance": "19.01.2027",
    "All India Permit": "-",
    "State permit": "-",
    "Engine No": "275IDI05CRZS11125",
    "Vehicle IDV Amount": "1,95,768",
    "GVW in Kgs": "001550",
    "Unloaden Weight in Kgs": "7500",
    "Insurance Company Name": "Go Digit General Insurance Ltd",
    "Policy No": "D248235811 / 20012026",
    "Premium Amount": "7191.55",
    "Remarks": "No original FC",
    "Accident Date": "04.11.2022",
    "Accident Time": "01:00",
    "Accident Place": "Walayar, Kerala",
    "Driver Name": "Shivakumar S"
  },
  {
    "SI No": 2,
    "Reg. No.": "KA53C0396",
    "Type": "tata ace",
    "Category": "dry",
    "Ownership": "kcm supply",
    "Model": "TATA Ace",
    "Reg Year": "2015",
    "Reg Date": "07.09.2015",
    "Chassis No": "MAT445064FVG19112",
    "Tax": "LTT",
    "Emission Test": "-",
    "FC": "22.09.2026",
    "Insurance": "28.08.2026",
    "All India Permit": "-",
    "State permit": "-",
    "Engine No": "275IDI06GUYS58686",
    "Vehicle IDV Amount": "195768",
    "GVW in Kgs": "001550",
    "Unloaden Weight in Kgs": "1060",
    "Insurance Company Name": "Go Digit General Insurance Ltd",
    "Policy No": "D216283435 / 29072025",
    "Premium Amount": "18622.3",
    "Remarks": "",
    "Accident Date": "07.07.2022",
    "Accident Time": "02:00",
    "Accident Place": "Near NH44, Mukthapuram, Andhrapradesh 515641",
    "Driver Name": "Naveena Kumara"
  },
  {
    "SI No": 3,
    "Reg. No.": "KA53D9514",
    "Type": "17ft",
    "Category": "dry",
    "Ownership": "kcm supply",
    "Model": "Partner Tes",
    "RegYear": "2019",
    "Reg Date": "13.09.2019",
    "Chassis No": "MB1AG34K0KRB77901",
    "Tax": "31.08.2026",
    "Emission Test": "28.09.2026",
    "FC": "12.09.2027",
    "Insurance": "14.09.2026",
    "All India Permit": "-",
    "State permit": "16.09.2029",
    "Engine No": "CKH50299TP",
    "Vehicle IDV Amount": "12,00,000",
    "GVW in Kgs": "7200",
    "Unloaden Weight in Kgs": "003200",
    "Insurance Company Name": "Zurich Kotak General Insurance Company (India) Limited",
    "Policy No": "2.51033E+11",
    "Premium Amount": "21,054",
    "Remarks": "Original RC handed over to Akshatha for HP cancelation",
    "Accident Date": "22-03-2025",
    "Accident Time": "11.30 pm",
    "Accident Place": "Boovanahalli,Near Sira",
    "Driver Name": "Raghavendra"
  },
  {
    "SI No": 4,
    "Reg. No.": "KA53D9515",
    "Type": "17ft",
    "Category": "dry",
    "Ownership": "kcm supply",
    "Model": "Partner Tes",
    "Reg Year": "2019",
    "Reg Date": "13.09.2019",
    "Chassis No": "MB1AG34K0KRB77946",
    "Tax": "31.08.2026",
    "Emission Test": "24.09.2024",
    "FC": "12.09.2027",
    "Insurance": "2026-07-18",
    "All India Permit": "-",
    "State permit": "16.09.2029",
    "Engine No": "CKH502999P",
    "Vehicle IDV Amount": "12,00,000",
    "GVW in Kgs": "6860",
    "Unloaden Weight in Kgs": "003200",
    "Insurance Company Name": "Zurich Kotak General Insurance Company (India) Limited",
    "Policy No": "2.51033E+11",
    "Premium Amount": "21,054",
    "Remarks": "Original RC handed over to Akshatha for HP cancelation",
    "Accident Date": "31.03.2023",
    "Accident Time": "03:00",
    "Accident Place": "Bhavani Eroad",
    "Driver Name": "Jayaprakash B"
  }
];

const initialFuelLogs = [
  { id: '1', regNo: 'KA53AA0069', date: '2026-07-01', quantity: 120, rate: 94.5, amount: 11340, odometer: 142300, slipNo: 'FL-9021', filledBy: 'Anil Singh' },
  { id: '2', regNo: 'KA403973', date: '2026-07-03', quantity: 45, rate: 94.5, amount: 4252.5, odometer: 289450, slipNo: 'FL-9045', filledBy: 'Pankaj Lal' }
];

const initialBillingInvoices = [
  { id: '1', invoiceNo: 'INV-2026-001', date: '2026-07-01', customerName: 'Flipkart Logistics Hub', amount: 45000, status: 'Paid', description: 'Fleet delivery service Bangalore to Chennai' },
  { id: '2', invoiceNo: 'INV-2026-002', date: '2026-07-03', customerName: 'Amazon Sort Center', amount: 85000, status: 'Pending', description: 'Daily runner canter line haul' }
];

const initialPettyCashVouchers = [
  {
    id: '1',
    date: '2026-06-15',
    entryNo: 'ENT-2026-001',
    category: 'TOLL CHARGES',
    location: 'Bangalore Tollway',
    clientName: 'swiggy',
    vendor: 'kcm insta',
    vehicleNumber: 'KA51AK4987',
    receiver: 'Shivakumar S',
    vendorId: 'VEND-INSTA-01',
    amountReceived: 2000,
    cashPaid: 1800,
    balance: 200,
    tripSheet: 'TRIP-9081',
    remarks: 'Fastag reload for swiggy delivery'
  }
];

const initialMaintenanceRecords = [
  { id: '1', regNo: 'KA403973', date: '2026-06-15', serviceType: 'Scheduled Servicing', description: 'Engine oil replacement, oil filter, air filter cleaning', cost: 4500, garageName: 'KCM Corporate Workshop' }
];

const initialAccountsEntries = [
  { id: '1', date: '2026-07-01', type: 'Income', category: 'Freight Revenue', amount: 45000, reference: 'INV-2026-001' },
  { id: '2', date: '2026-07-01', type: 'Expense', category: 'Driver Allowance', amount: 5000, reference: 'PC-9912' }
];

const initialNotifications = [
  { id: '1', title: 'Insurance Expiry Impending', message: 'Vehicle KA53D9515 insurance is expiring on 2026-07-18 (in 11 days). Please renew immediately.', type: 'insurance', timestamp: '2026-07-07 00:00:00', read: false, vehicleRegNo: 'KA53D9515' }
];

const initialWarehouseEntries: WarehouseEntry[] = [
  {
    id: 'wh-1',
    slNo: 1,
    date: '2026-07-10',
    warehouseName: 'Flipkart WH 1',
    warehouseCity: 'Bangalore',
    vehicleNumber: 'KA53D9514',
    vehicleType: '17ft',
    vehicleCategory: 'dry',
    deploymentType: 'regular',
    pod: 'POD-10291',
    podCity: 'Chennai',
    fixedHours: 12,
    kmSlab: '100 km',
    openingKm: 12000,
    closingKm: 12110,
    inTime: '08:00',
    closureTime: '20:30',
    kmUtilised: 110,
    hoursDaysAsPerContract: 1,
    overtimeVehicle: 'No',
    extraKm: 10,
    baseRate: 4500,
    fuelCost: 1200,
    finalBaseRate: 5700,
    additionalKmCost: 150,
    additionalHourCost: 100,
    tollCharges: 320,
    parkingCost: 50,
    hybridReeferCost: 0,
    grandTotal: 6320,
    vendorRemarks: 'On-time delivery'
  }
];

// Tire Brand dropdown - fixed display order, not alphabetical (see TireBrand).
export const DEFAULT_TIRE_BRANDS: TireBrand[] = [
  { id: 'apollo', name: 'Apollo', displayOrder: 1 },
  { id: 'mrf', name: 'MRF', displayOrder: 2 },
  { id: 'jk-tyre', name: 'JK Tyre', displayOrder: 3 },
  { id: 'bridgestone', name: 'Bridgestone', displayOrder: 4 }
];

// Seed databases helper
export async function seedDatabase() {
  try {
    const existingUsers = await db.select().from(users);
    const existingUsernames = new Set(existingUsers.map(u => u.username));
    const missingUsers = DEFAULT_USERS.filter(u => !existingUsernames.has(u.username));
    if (missingUsers.length > 0) {
      console.log(`Seeding ${missingUsers.length} new default user(s)...`);
      for (const u of missingUsers) {
        await db.insert(users).values(u);
      }
    }

    const existingVehicles = await db.select().from(vehicles);
    if (existingVehicles.length === 0) {
      console.log('Seeding initial vehicles...');
      for (const v of initialVehicles) {
        const id = v["Reg. No."] || `v-${Date.now()}`;
        await db.insert(vehicles).values({
          id,
          regNo: v["Reg. No."],
          data: JSON.stringify(v)
        });
      }
    }

    const existingFuel = await db.select().from(fuelLogs);
    if (existingFuel.length === 0) {
      for (const f of initialFuelLogs) {
        await db.insert(fuelLogs).values({ id: f.id, data: JSON.stringify(f) });
      }
    }

    const existingBilling = await db.select().from(billingInvoices);
    if (existingBilling.length === 0) {
      for (const b of initialBillingInvoices) {
        await db.insert(billingInvoices).values({ id: b.id, data: JSON.stringify(b) });
      }
    }

    const existingPetty = await db.select().from(pettyCashVouchers);
    if (existingPetty.length === 0) {
      for (const p of initialPettyCashVouchers) {
        await db.insert(pettyCashVouchers).values({ id: p.id, data: JSON.stringify(p) });
      }
    }

    const existingMaint = await db.select().from(maintenanceRecords);
    if (existingMaint.length === 0) {
      for (const m of initialMaintenanceRecords) {
        await db.insert(maintenanceRecords).values({ id: m.id, data: JSON.stringify(m) });
      }
    }

    const existingAccounts = await db.select().from(accountsEntries);
    if (existingAccounts.length === 0) {
      for (const a of initialAccountsEntries) {
        await db.insert(accountsEntries).values({ id: a.id, data: JSON.stringify(a) });
      }
    }

    const existingNotifs = await db.select().from(notifications);
    if (existingNotifs.length === 0) {
      for (const n of initialNotifications) {
        await db.insert(notifications).values({ id: n.id, data: JSON.stringify(n) });
      }
    }

    const existingTireBrands = await db.select().from(tireBrands);
    if (existingTireBrands.length === 0) {
      for (const b of DEFAULT_TIRE_BRANDS) {
        await db.insert(tireBrands).values({ id: b.id, data: JSON.stringify(b) });
      }
    }

    const existingWarehouse = await db.select().from(warehouseEntries);
    if (existingWarehouse.length === 0) {
      for (const w of initialWarehouseEntries) {
        await db.insert(warehouseEntries).values({ id: w.id, data: JSON.stringify(w) });
      }
    }

    console.log('Database seeded successfully.');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

// 2-Layer Error Handling as requested in Guideline 5.3
// --- USER OPERATIONS ---
export async function getUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error("Database query failed in getUsers: falling back to seeded users", error);
    return DEFAULT_USERS;
  }
}

export async function updateUserPassword(email: string, newPass: string) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const matched = await db.select().from(users);
    const user = matched.find(u => u.email?.toLowerCase() === cleanEmail);
    if (!user) throw new Error("User not found");
    const hashed = await hashPassword(newPass);
    await db.update(users).set({ pass: hashed }).where(eq(users.id, user.id));
    return true;
  } catch (error) {
    console.error("Database action failed in updateUserPassword:", error);
    throw new Error("Failed to update user password.", { cause: error });
  }
}

// One-time (idempotent) upgrade path: hashes any user row whose password is
// still stored in plain text. Safe to call on every startup - already-hashed
// rows are skipped.
export async function migratePlaintextPasswords() {
  try {
    const allUsers = await db.select().from(users);
    let migrated = 0;
    for (const u of allUsers) {
      if (u.pass && !isHashed(u.pass)) {
        const hashed = await hashPassword(u.pass);
        await db.update(users).set({ pass: hashed }).where(eq(users.id, u.id));
        migrated++;
      }
    }
    if (migrated > 0) {
      console.log(`[AUTH] Migrated ${migrated} legacy plain-text password(s) to bcrypt hashes.`);
    }
  } catch (error) {
    console.error("Password migration failed:", error);
  }
}

// --- VEHICLE OPERATIONS ---
export async function getVehicles(): Promise<Vehicle[]> {
  try {
    const rows = await db.select().from(vehicles);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getVehicles:", error);
    throw new Error("Failed to retrieve fleet vehicles.", { cause: error });
  }
}

export async function saveVehicle(vehicle: Vehicle) {
  try {
    const regNo = vehicle['Reg. No.'] || vehicle.regNo || vehicle.id || `v-${Date.now()}`;
    const id = regNo;
    const dataString = JSON.stringify(vehicle);

    const existing = await db.select().from(vehicles).where(eq(vehicles.id, id));
    if (existing.length > 0) {
      await db.update(vehicles).set({ regNo, data: dataString }).where(eq(vehicles.id, id));
    } else {
      await db.insert(vehicles).values({ id, regNo, data: dataString });
    }
    return await getVehicles();
  } catch (error) {
    console.error("Database action failed in saveVehicle:", error);
    throw new Error("Failed to save or update vehicle.", { cause: error });
  }
}

export async function deleteVehicle(id: string) {
  try {
    await db.delete(vehicles).where(eq(vehicles.id, id));
    return await getVehicles();
  } catch (error) {
    console.error("Database action failed in deleteVehicle:", error);
    throw new Error("Failed to delete vehicle.", { cause: error });
  }
}

// --- FUEL LOG OPERATIONS ---
export async function getFuelLogs(): Promise<FuelLog[]> {
  try {
    const rows = await db.select().from(fuelLogs);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getFuelLogs:", error);
    throw new Error("Failed to retrieve fuel logs.", { cause: error });
  }
}

export async function saveFuelLog(log: FuelLog) {
  try {
    const id = log.id || String(Date.now());
    const completeLog = { ...log, id };
    const dataString = JSON.stringify(completeLog);

    const existing = await db.select().from(fuelLogs).where(eq(fuelLogs.id, id));
    if (existing.length > 0) {
      await db.update(fuelLogs).set({ data: dataString }).where(eq(fuelLogs.id, id));
    } else {
      await db.insert(fuelLogs).values({ id, data: dataString });
    }
    return await getFuelLogs();
  } catch (error) {
    console.error("Database action failed in saveFuelLog:", error);
    throw new Error("Failed to save fuel log.", { cause: error });
  }
}

export async function deleteFuelLog(id: string) {
  try {
    await db.delete(fuelLogs).where(eq(fuelLogs.id, id));
    return await getFuelLogs();
  } catch (error) {
    console.error("Database action failed in deleteFuelLog:", error);
    throw new Error("Failed to delete fuel log.", { cause: error });
  }
}

// --- BILLING INVOICE OPERATIONS ---
export async function getBillingInvoices(): Promise<BillingInvoice[]> {
  try {
    const rows = await db.select().from(billingInvoices);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getBillingInvoices:", error);
    throw new Error("Failed to retrieve billing invoices.", { cause: error });
  }
}

export async function saveBillingInvoice(invoice: BillingInvoice) {
  try {
    const id = invoice.id || String(Date.now());
    const completeInvoice = { ...invoice, id };
    const dataString = JSON.stringify(completeInvoice);

    const existing = await db.select().from(billingInvoices).where(eq(billingInvoices.id, id));
    if (existing.length > 0) {
      await db.update(billingInvoices).set({ data: dataString }).where(eq(billingInvoices.id, id));
    } else {
      await db.insert(billingInvoices).values({ id, data: dataString });
    }
    return await getBillingInvoices();
  } catch (error) {
    console.error("Database action failed in saveBillingInvoice:", error);
    throw new Error("Failed to save billing invoice.", { cause: error });
  }
}

export async function deleteBillingInvoice(id: string) {
  try {
    await db.delete(billingInvoices).where(eq(billingInvoices.id, id));
    return await getBillingInvoices();
  } catch (error) {
    console.error("Database action failed in deleteBillingInvoice:", error);
    throw new Error("Failed to delete billing invoice.", { cause: error });
  }
}

// --- PETTY CASH VOUCHER OPERATIONS ---
export async function getPettyCashVouchers(): Promise<PettyCashVoucher[]> {
  try {
    const rows = await db.select().from(pettyCashVouchers);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getPettyCashVouchers:", error);
    throw new Error("Failed to retrieve petty cash vouchers.", { cause: error });
  }
}

export async function savePettyCashVoucher(voucher: PettyCashVoucher) {
  try {
    const id = voucher.id || String(Date.now());
    const completeVoucher = { ...voucher, id };
    const dataString = JSON.stringify(completeVoucher);

    const existing = await db.select().from(pettyCashVouchers).where(eq(pettyCashVouchers.id, id));
    if (existing.length > 0) {
      await db.update(pettyCashVouchers).set({ data: dataString }).where(eq(pettyCashVouchers.id, id));
    } else {
      await db.insert(pettyCashVouchers).values({ id, data: dataString });
    }
    return await getPettyCashVouchers();
  } catch (error) {
    console.error("Database action failed in savePettyCashVoucher:", error);
    throw new Error("Failed to save petty cash voucher.", { cause: error });
  }
}

export async function deletePettyCashVoucher(id: string) {
  try {
    await db.delete(pettyCashVouchers).where(eq(pettyCashVouchers.id, id));
    return await getPettyCashVouchers();
  } catch (error) {
    console.error("Database action failed in deletePettyCashVoucher:", error);
    throw new Error("Failed to delete petty cash voucher.", { cause: error });
  }
}

// --- MARKET POD OPERATIONS ---
export async function getMarketPodEntries(): Promise<MarketPodEntry[]> {
  try {
    const rows = await db.select().from(marketPodEntries);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getMarketPodEntries:", error);
    throw new Error("Failed to retrieve Market Trip entries.", { cause: error });
  }
}

export async function saveMarketPodEntry(entry: MarketPodEntry) {
  try {
    const id = entry.id || String(Date.now());
    const completeEntry = { ...entry, id };
    const dataString = JSON.stringify(completeEntry);

    const existing = await db.select().from(marketPodEntries).where(eq(marketPodEntries.id, id));
    if (existing.length > 0) {
      await db.update(marketPodEntries).set({ data: dataString }).where(eq(marketPodEntries.id, id));
    } else {
      await db.insert(marketPodEntries).values({ id, data: dataString });
    }
    return await getMarketPodEntries();
  } catch (error) {
    console.error("Database action failed in saveMarketPodEntry:", error);
    throw new Error("Failed to save Market Trip entry.", { cause: error });
  }
}

export async function deleteMarketPodEntry(id: string) {
  try {
    await db.delete(marketPodEntries).where(eq(marketPodEntries.id, id));
    return await getMarketPodEntries();
  } catch (error) {
    console.error("Database action failed in deleteMarketPodEntry:", error);
    throw new Error("Failed to delete Market Trip entry.", { cause: error });
  }
}

// --- PETTY CASH ADVANCE ("Amount Received") OPERATIONS ---
export async function getPettyCashAdvances(): Promise<PettyCashAdvance[]> {
  try {
    const rows = await db.select().from(pettyCashAdvances);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getPettyCashAdvances:", error);
    throw new Error("Failed to retrieve petty cash advances.", { cause: error });
  }
}

export async function savePettyCashAdvance(advance: PettyCashAdvance) {
  try {
    const id = advance.id || String(Date.now());
    const completeAdvance = { ...advance, id };
    const dataString = JSON.stringify(completeAdvance);

    const existing = await db.select().from(pettyCashAdvances).where(eq(pettyCashAdvances.id, id));
    if (existing.length > 0) {
      await db.update(pettyCashAdvances).set({ data: dataString, username: advance.username }).where(eq(pettyCashAdvances.id, id));
    } else {
      await db.insert(pettyCashAdvances).values({ id, username: advance.username, data: dataString });
    }
    return await getPettyCashAdvances();
  } catch (error) {
    console.error("Database action failed in savePettyCashAdvance:", error);
    throw new Error("Failed to save petty cash advance.", { cause: error });
  }
}

export async function deletePettyCashAdvance(id: string) {
  try {
    await db.delete(pettyCashAdvances).where(eq(pettyCashAdvances.id, id));
    return await getPettyCashAdvances();
  } catch (error) {
    console.error("Database action failed in deletePettyCashAdvance:", error);
    throw new Error("Failed to delete petty cash advance.", { cause: error });
  }
}

// --- MAINTENANCE RECORD OPERATIONS ---
export async function getMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  try {
    const rows = await db.select().from(maintenanceRecords);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getMaintenanceRecords:", error);
    throw new Error("Failed to retrieve maintenance records.", { cause: error });
  }
}

export async function saveMaintenanceRecord(record: MaintenanceRecord) {
  try {
    const id = record.id || String(Date.now());
    const completeRecord = { ...record, id };
    const dataString = JSON.stringify(completeRecord);

    const existing = await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, id));
    if (existing.length > 0) {
      await db.update(maintenanceRecords).set({ data: dataString }).where(eq(maintenanceRecords.id, id));
    } else {
      await db.insert(maintenanceRecords).values({ id, data: dataString });
    }
    return await getMaintenanceRecords();
  } catch (error) {
    console.error("Database action failed in saveMaintenanceRecord:", error);
    throw new Error("Failed to save maintenance record.", { cause: error });
  }
}

export async function deleteMaintenanceRecord(id: string) {
  try {
    await db.delete(maintenanceRecords).where(eq(maintenanceRecords.id, id));
    return await getMaintenanceRecords();
  } catch (error) {
    console.error("Database action failed in deleteMaintenanceRecord:", error);
    throw new Error("Failed to delete maintenance record.", { cause: error });
  }
}

// --- VEHICLE MAINTENANCE PROFILE OPERATIONS ---
export async function getVehicleMaintenanceProfiles(): Promise<VehicleMaintenanceProfile[]> {
  try {
    const rows = await db.select().from(vehicleMaintenanceProfiles);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getVehicleMaintenanceProfiles:", error);
    throw new Error("Failed to retrieve vehicle maintenance profiles.", { cause: error });
  }
}

export async function saveVehicleMaintenanceProfile(profile: VehicleMaintenanceProfile) {
  try {
    const id = profile.id || profile.regNo;
    const completeProfile = { ...profile, id };
    const dataString = JSON.stringify(completeProfile);

    const existing = await db.select().from(vehicleMaintenanceProfiles).where(eq(vehicleMaintenanceProfiles.id, id));
    if (existing.length > 0) {
      await db.update(vehicleMaintenanceProfiles).set({ data: dataString }).where(eq(vehicleMaintenanceProfiles.id, id));
    } else {
      await db.insert(vehicleMaintenanceProfiles).values({ id, data: dataString });
    }
    return await getVehicleMaintenanceProfiles();
  } catch (error) {
    console.error("Database action failed in saveVehicleMaintenanceProfile:", error);
    throw new Error("Failed to save vehicle maintenance profile.", { cause: error });
  }
}

export async function deleteVehicleMaintenanceProfile(id: string) {
  try {
    await db.delete(vehicleMaintenanceProfiles).where(eq(vehicleMaintenanceProfiles.id, id));
    return await getVehicleMaintenanceProfiles();
  } catch (error) {
    console.error("Database action failed in deleteVehicleMaintenanceProfile:", error);
    throw new Error("Failed to delete vehicle maintenance profile.", { cause: error });
  }
}

// --- MAINTENANCE SERVICE STATION OPERATIONS ---
export async function getMaintenanceServiceStations(): Promise<MaintenanceServiceStation[]> {
  try {
    const rows = await db.select().from(maintenanceServiceStations);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getMaintenanceServiceStations:", error);
    throw new Error("Failed to retrieve maintenance service stations.", { cause: error });
  }
}

export async function saveMaintenanceServiceStation(station: MaintenanceServiceStation) {
  try {
    const id = station.id || String(Date.now());
    const completeStation = { ...station, id };
    const dataString = JSON.stringify(completeStation);

    const existing = await db.select().from(maintenanceServiceStations).where(eq(maintenanceServiceStations.id, id));
    if (existing.length > 0) {
      await db.update(maintenanceServiceStations).set({ data: dataString }).where(eq(maintenanceServiceStations.id, id));
    } else {
      await db.insert(maintenanceServiceStations).values({ id, data: dataString });
    }
    return await getMaintenanceServiceStations();
  } catch (error) {
    console.error("Database action failed in saveMaintenanceServiceStation:", error);
    throw new Error("Failed to save maintenance service station.", { cause: error });
  }
}

export async function deleteMaintenanceServiceStation(id: string) {
  try {
    await db.delete(maintenanceServiceStations).where(eq(maintenanceServiceStations.id, id));
    return await getMaintenanceServiceStations();
  } catch (error) {
    console.error("Database action failed in deleteMaintenanceServiceStation:", error);
    throw new Error("Failed to delete maintenance service station.", { cause: error });
  }
}

// --- BREAKDOWN REPORT OPERATIONS ---
export async function getBreakdownReports(): Promise<BreakdownReport[]> {
  try {
    const rows = await db.select().from(breakdownReports);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getBreakdownReports:", error);
    throw new Error("Failed to retrieve breakdown reports.", { cause: error });
  }
}

export async function saveBreakdownReport(report: BreakdownReport) {
  try {
    const id = report.id || String(Date.now());
    const completeReport = { ...report, id };
    const dataString = JSON.stringify(completeReport);

    const existing = await db.select().from(breakdownReports).where(eq(breakdownReports.id, id));
    if (existing.length > 0) {
      await db.update(breakdownReports).set({ data: dataString }).where(eq(breakdownReports.id, id));
    } else {
      await db.insert(breakdownReports).values({ id, data: dataString });
    }
    return await getBreakdownReports();
  } catch (error) {
    console.error("Database action failed in saveBreakdownReport:", error);
    throw new Error("Failed to save breakdown report.", { cause: error });
  }
}

export async function deleteBreakdownReport(id: string) {
  try {
    await db.delete(breakdownReports).where(eq(breakdownReports.id, id));
    return await getBreakdownReports();
  } catch (error) {
    console.error("Database action failed in deleteBreakdownReport:", error);
    throw new Error("Failed to delete breakdown report.", { cause: error });
  }
}

// --- VEHICLE SERVICE SCHEDULE OPERATIONS (Fleet Maintenance rebuild) ---
export async function getVehicleServiceSchedules(): Promise<VehicleServiceSchedule[]> {
  try {
    const rows = await db.select().from(vehicleServiceSchedules);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getVehicleServiceSchedules:", error);
    throw new Error("Failed to retrieve vehicle service schedules.", { cause: error });
  }
}

export async function saveVehicleServiceSchedule(schedule: VehicleServiceSchedule) {
  try {
    const id = schedule.id || schedule.regNo;
    const complete = { ...schedule, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(vehicleServiceSchedules).where(eq(vehicleServiceSchedules.id, id));
    if (existing.length > 0) {
      await db.update(vehicleServiceSchedules).set({ data: dataString }).where(eq(vehicleServiceSchedules.id, id));
    } else {
      await db.insert(vehicleServiceSchedules).values({ id, data: dataString });
    }
    return await getVehicleServiceSchedules();
  } catch (error) {
    console.error("Database action failed in saveVehicleServiceSchedule:", error);
    throw new Error("Failed to save vehicle service schedule.", { cause: error });
  }
}

export async function deleteVehicleServiceSchedule(id: string) {
  try {
    await db.delete(vehicleServiceSchedules).where(eq(vehicleServiceSchedules.id, id));
    return await getVehicleServiceSchedules();
  } catch (error) {
    console.error("Database action failed in deleteVehicleServiceSchedule:", error);
    throw new Error("Failed to delete vehicle service schedule.", { cause: error });
  }
}

// --- TIRE BRAND OPERATIONS ---
export async function getTireBrands(): Promise<TireBrand[]> {
  try {
    const rows = await db.select().from(tireBrands);
    return rows.map(r => JSON.parse(r.data) as TireBrand).sort((a, b) => a.displayOrder - b.displayOrder);
  } catch (error) {
    console.error("Database query failed in getTireBrands:", error);
    throw new Error("Failed to retrieve tire brands.", { cause: error });
  }
}

// Case-insensitive dedupe: an existing match (however it was cased) is
// reused as-is rather than creating a near-duplicate entry. A genuinely new
// name is appended after the current highest displayOrder - never
// alphabetized, never inserted between existing entries - so the seeded
// Apollo/MRF/JK Tyre/Bridgestone stay fixed at the top in that order.
export async function addTireBrand(name: string): Promise<TireBrand[]> {
  try {
    const trimmed = name.trim();
    const existingList = await getTireBrands();
    if (!trimmed) return existingList;
    const dup = existingList.find(b => b.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return existingList;

    const nextOrder = existingList.reduce((max, b) => Math.max(max, b.displayOrder), 0) + 1;
    const brand: TireBrand = { id: String(Date.now()), name: trimmed, displayOrder: nextOrder };
    await db.insert(tireBrands).values({ id: brand.id, data: JSON.stringify(brand) });
    return await getTireBrands();
  } catch (error) {
    console.error("Database action failed in addTireBrand:", error);
    throw new Error("Failed to add tire brand.", { cause: error });
  }
}

// --- TIRE RECORD OPERATIONS ---
export async function getTireRecords(): Promise<TireRecord[]> {
  try {
    const rows = await db.select().from(tireRecords);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getTireRecords:", error);
    throw new Error("Failed to retrieve tire records.", { cause: error });
  }
}

export async function saveTireRecord(record: TireRecord) {
  try {
    const id = record.id || String(Date.now());
    const complete = { ...record, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(tireRecords).where(eq(tireRecords.id, id));
    if (existing.length > 0) {
      await db.update(tireRecords).set({ data: dataString, regNo: complete.regNo }).where(eq(tireRecords.id, id));
    } else {
      await db.insert(tireRecords).values({ id, regNo: complete.regNo, data: dataString });
    }
    return await getTireRecords();
  } catch (error) {
    console.error("Database action failed in saveTireRecord:", error);
    throw new Error("Failed to save tire record.", { cause: error });
  }
}

export async function deleteTireRecord(id: string) {
  try {
    await db.delete(tireRecords).where(eq(tireRecords.id, id));
    return await getTireRecords();
  } catch (error) {
    console.error("Database action failed in deleteTireRecord:", error);
    throw new Error("Failed to delete tire record.", { cause: error });
  }
}

// --- BATTERY RECORD OPERATIONS ---
export async function getBatteryRecords(): Promise<BatteryRecord[]> {
  try {
    const rows = await db.select().from(batteryRecords);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getBatteryRecords:", error);
    throw new Error("Failed to retrieve battery records.", { cause: error });
  }
}

export async function saveBatteryRecord(record: BatteryRecord) {
  try {
    const id = record.id || String(Date.now());
    const complete = { ...record, id };
    const dataString = JSON.stringify(complete);

    // Only one battery per vehicle should ever be "current" - flip any other
    // current row for this regNo to false before writing this one, same
    // spirit as BreakdownReport's Open->Resolved single-active-state pattern.
    if (complete.isCurrent) {
      const siblings = await db.select().from(batteryRecords).where(eq(batteryRecords.regNo, complete.regNo));
      for (const row of siblings) {
        if (row.id === id) continue;
        const parsed: BatteryRecord = JSON.parse(row.data);
        if (parsed.isCurrent) {
          await db.update(batteryRecords).set({ data: JSON.stringify({ ...parsed, isCurrent: false }) }).where(eq(batteryRecords.id, row.id));
        }
      }
    }

    const existing = await db.select().from(batteryRecords).where(eq(batteryRecords.id, id));
    if (existing.length > 0) {
      await db.update(batteryRecords).set({ data: dataString, regNo: complete.regNo }).where(eq(batteryRecords.id, id));
    } else {
      await db.insert(batteryRecords).values({ id, regNo: complete.regNo, data: dataString });
    }
    return await getBatteryRecords();
  } catch (error) {
    console.error("Database action failed in saveBatteryRecord:", error);
    throw new Error("Failed to save battery record.", { cause: error });
  }
}

export async function deleteBatteryRecord(id: string) {
  try {
    await db.delete(batteryRecords).where(eq(batteryRecords.id, id));
    return await getBatteryRecords();
  } catch (error) {
    console.error("Database action failed in deleteBatteryRecord:", error);
    throw new Error("Failed to delete battery record.", { cause: error });
  }
}

// --- TOOLS CHECKLIST RECORD OPERATIONS ---
export async function getToolsChecklistRecords(): Promise<ToolsChecklistRecord[]> {
  try {
    const rows = await db.select().from(toolsChecklistRecords);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getToolsChecklistRecords:", error);
    throw new Error("Failed to retrieve tools checklist records.", { cause: error });
  }
}

export async function saveToolsChecklistRecord(record: ToolsChecklistRecord) {
  try {
    const id = record.id || String(Date.now());
    const complete = { ...record, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(toolsChecklistRecords).where(eq(toolsChecklistRecords.id, id));
    if (existing.length > 0) {
      await db.update(toolsChecklistRecords).set({ data: dataString, regNo: complete.regNo }).where(eq(toolsChecklistRecords.id, id));
    } else {
      await db.insert(toolsChecklistRecords).values({ id, regNo: complete.regNo, data: dataString });
    }
    return await getToolsChecklistRecords();
  } catch (error) {
    console.error("Database action failed in saveToolsChecklistRecord:", error);
    throw new Error("Failed to save tools checklist record.", { cause: error });
  }
}

export async function deleteToolsChecklistRecord(id: string) {
  try {
    await db.delete(toolsChecklistRecords).where(eq(toolsChecklistRecords.id, id));
    return await getToolsChecklistRecords();
  } catch (error) {
    console.error("Database action failed in deleteToolsChecklistRecord:", error);
    throw new Error("Failed to delete tools checklist record.", { cause: error });
  }
}

// One-time migration: the Fleet Maintenance rebuild replaced the single
// combined VehicleMaintenanceProfile with 4 focused tables. If those 4 are
// still completely empty but legacy profiles exist, convert each profile
// into a VehicleServiceSchedule + TireRecord[] + BatteryRecord + a
// ToolsChecklistRecord snapshot, so nothing already entered gets silently
// dropped. Safe to call on every boot - it's a no-op once the new tables
// have any data at all (never overwrites/re-runs after that point, even if
// more legacy profiles are added later - those are effectively frozen).
export async function migrateLegacyMaintenanceProfiles() {
  try {
    const [legacyProfiles, existingSchedules] = await Promise.all([
      getVehicleMaintenanceProfiles(),
      getVehicleServiceSchedules()
    ]);
    if (legacyProfiles.length === 0 || existingSchedules.length > 0) return;

    const legacyRecords = await getMaintenanceRecords();
    const TOOL_FIELD_BY_NAME: Record<string, 'hasJack' | 'hasJackRod' | 'hasTommyBar' | 'hasSpanner'> = {
      jack: 'hasJack',
      'jack rod': 'hasJackRod',
      'tommy bar': 'hasTommyBar',
      spanner: 'hasSpanner'
    };

    for (const profile of legacyProfiles) {
      const regNo = profile.regNo || profile.id;
      if (!regNo) continue;

      const lastServiceDate = legacyRecords
        .filter(r => (r.regNo || '').trim().toUpperCase() === regNo.trim().toUpperCase())
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;

      await saveVehicleServiceSchedule({
        id: regNo,
        regNo,
        lastServiceDate,
        lastServiceKm: profile.serviceLastOdometerKm,
        serviceIntervalKm: profile.serviceIntervalKm ?? 10000,
        warrantyStatus: profile.warrantyStatus === 'Under Warranty' ? 'InWarranty' : 'OutOfWarranty',
        remarks: 'Migrated from the legacy Vehicle Maintenance Profile.'
      });

      for (const tyre of profile.tyres || []) {
        await saveTireRecord({
          id: `${regNo}-${tyre.position || 'unspecified'}-legacy`,
          regNo,
          position: tyre.position || 'Unspecified',
          tireBrand: tyre.brand || '',
          installedKm: tyre.kmRun || undefined,
          // The legacy model tracked wheel alignment once per vehicle, not
          // per tyre - applied here as this tyre's starting point so the new
          // per-tyre alignment cycle has a baseline to compute from.
          lastAlignmentKm: profile.wheelAlignmentLastOdometerKm
        });
      }

      if (profile.batteryNumber) {
        await saveBatteryRecord({
          id: `${regNo}-legacy-battery`,
          regNo,
          batteryNumber: profile.batteryNumber,
          isCurrent: true
        });
      }

      if (profile.toolsChecklist && profile.toolsChecklist.length > 0) {
        const flags: Record<string, boolean> = { hasJack: false, hasJackRod: false, hasTommyBar: false, hasSpanner: false };
        const extras: string[] = [];
        for (const tool of profile.toolsChecklist) {
          const field = TOOL_FIELD_BY_NAME[(tool.name || '').trim().toLowerCase()];
          if (field) flags[field] = tool.present;
          else extras.push(`${tool.name}: ${tool.present ? 'Yes' : 'No'}`);
        }
        await saveToolsChecklistRecord({
          id: `${regNo}-legacy-checklist`,
          regNo,
          checkDate: new Date().toISOString().slice(0, 10),
          hasJack: flags.hasJack,
          hasJackRod: flags.hasJackRod,
          hasTommyBar: flags.hasTommyBar,
          hasSpanner: flags.hasSpanner,
          remarks: ['Migrated from the legacy Vehicle Maintenance Profile.', ...extras].join(' ')
        });
      }
    }

    console.log(`[MIGRATION] Converted ${legacyProfiles.length} legacy vehicle maintenance profile(s) into the new Service Schedule / Tire / Battery / Tools Checklist tables.`);
  } catch (error) {
    console.error("Migration failed in migrateLegacyMaintenanceProfiles:", error);
  }
}

// --- ACCOUNTS ENTRY OPERATIONS ---
export async function getAccountsEntries(): Promise<AccountsEntry[]> {
  try {
    const rows = await db.select().from(accountsEntries);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getAccountsEntries:", error);
    throw new Error("Failed to retrieve accounts entries.", { cause: error });
  }
}

export async function saveAccountsEntry(entry: AccountsEntry) {
  try {
    const id = entry.id || String(Date.now());
    const completeEntry = { ...entry, id };
    const dataString = JSON.stringify(completeEntry);

    const existing = await db.select().from(accountsEntries).where(eq(accountsEntries.id, id));
    if (existing.length > 0) {
      await db.update(accountsEntries).set({ data: dataString }).where(eq(accountsEntries.id, id));
    } else {
      await db.insert(accountsEntries).values({ id, data: dataString });
    }
    return await getAccountsEntries();
  } catch (error) {
    console.error("Database action failed in saveAccountsEntry:", error);
    throw new Error("Failed to save accounts entry.", { cause: error });
  }
}

export async function deleteAccountsEntry(id: string) {
  try {
    await db.delete(accountsEntries).where(eq(accountsEntries.id, id));
    return await getAccountsEntries();
  } catch (error) {
    console.error("Database action failed in deleteAccountsEntry:", error);
    throw new Error("Failed to delete accounts entry.", { cause: error });
  }
}

// --- STAFF EMPLOYEE OPERATIONS ---
export async function getStaffEmployees(): Promise<StaffEmployee[]> {
  try {
    const rows = await db.select().from(staffEmployees);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffEmployees:", error);
    throw new Error("Failed to retrieve staff employees.", { cause: error });
  }
}

// EmpId prefix determines OrgUnit - e.g. KCMI30001 -> Insta, KCM15001 -> Supply.
// Derived server-side (not user-editable) so the dropdown/EmpId can never disagree.
function deriveOrgUnit(empId: string): 'KCM_SUPPLY' | 'KCM_INSTA' {
  return /^KCMI\d+/i.test(empId) ? 'KCM_INSTA' : 'KCM_SUPPLY';
}

export async function saveStaffEmployee(employee: StaffEmployee) {
  try {
    const id = employee.id || String(Date.now());
    const completeEmployee: StaffEmployee = {
      ...employee,
      id,
      orgUnit: deriveOrgUnit(id),
      // Setting a Date of Leaving always implies Inactive, regardless of what the client sent.
      status: employee.dateOfLeaving ? 'Inactive' : employee.status
    };
    const dataString = JSON.stringify(completeEmployee);

    const existing = await db.select().from(staffEmployees).where(eq(staffEmployees.id, id));
    if (existing.length > 0) {
      await db.update(staffEmployees).set({ data: dataString }).where(eq(staffEmployees.id, id));
    } else {
      await db.insert(staffEmployees).values({ id, data: dataString });
    }
    return await getStaffEmployees();
  } catch (error) {
    console.error("Database action failed in saveStaffEmployee:", error);
    throw new Error("Failed to save staff employee.", { cause: error });
  }
}

export async function deleteStaffEmployee(id: string) {
  try {
    await db.delete(staffEmployees).where(eq(staffEmployees.id, id));
    return await getStaffEmployees();
  } catch (error) {
    console.error("Database action failed in deleteStaffEmployee:", error);
    throw new Error("Failed to delete staff employee.", { cause: error });
  }
}

// --- STAFF SALARY DETAIL OPERATIONS ---
export async function getStaffSalaryDetails(): Promise<StaffSalaryDetail[]> {
  try {
    const rows = await db.select().from(staffSalaryDetails);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffSalaryDetails:", error);
    throw new Error("Failed to retrieve staff salary details.", { cause: error });
  }
}

export async function saveStaffSalaryDetail(detail: StaffSalaryDetail) {
  try {
    const id = detail.id || String(Date.now());
    const complete = { ...detail, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(staffSalaryDetails).where(eq(staffSalaryDetails.id, id));
    if (existing.length > 0) {
      await db.update(staffSalaryDetails).set({ empId: complete.empId, data: dataString }).where(eq(staffSalaryDetails.id, id));
    } else {
      await db.insert(staffSalaryDetails).values({ id, empId: complete.empId, data: dataString });
    }
    return await getStaffSalaryDetails();
  } catch (error) {
    console.error("Database action failed in saveStaffSalaryDetail:", error);
    throw new Error("Failed to save staff salary detail.", { cause: error });
  }
}

// --- STAFF SALARY HIKE OPERATIONS (rows-based hike history) ---
export async function getStaffSalaryHikes(): Promise<StaffSalaryHike[]> {
  try {
    const rows = await db.select().from(staffSalaryHikes);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffSalaryHikes:", error);
    throw new Error("Failed to retrieve staff salary hikes.", { cause: error });
  }
}

export async function saveStaffSalaryHike(hike: StaffSalaryHike) {
  try {
    const id = hike.id || String(Date.now());
    const complete = { ...hike, id };
    const dataString = JSON.stringify(complete);
    await db.insert(staffSalaryHikes).values({ id, empId: complete.empId, data: dataString });
    return await getStaffSalaryHikes();
  } catch (error) {
    console.error("Database action failed in saveStaffSalaryHike:", error);
    throw new Error("Failed to save staff salary hike.", { cause: error });
  }
}

export async function deleteStaffSalaryHike(id: string) {
  try {
    await db.delete(staffSalaryHikes).where(eq(staffSalaryHikes.id, id));
    return await getStaffSalaryHikes();
  } catch (error) {
    console.error("Database action failed in deleteStaffSalaryHike:", error);
    throw new Error("Failed to delete staff salary hike.", { cause: error });
  }
}

// --- STAFF ADVANCE DEDUCTION OPERATIONS (rows-based deduction history) ---
export async function getStaffAdvanceDeductions(): Promise<StaffAdvanceDeduction[]> {
  try {
    const rows = await db.select().from(staffAdvanceDeductions);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffAdvanceDeductions:", error);
    throw new Error("Failed to retrieve staff advance deductions.", { cause: error });
  }
}

export async function saveStaffAdvanceDeduction(deduction: StaffAdvanceDeduction) {
  try {
    const id = deduction.id || String(Date.now());
    const complete = { ...deduction, id };
    const dataString = JSON.stringify(complete);
    await db.insert(staffAdvanceDeductions).values({ id, empId: complete.empId, data: dataString });
    return await getStaffAdvanceDeductions();
  } catch (error) {
    console.error("Database action failed in saveStaffAdvanceDeduction:", error);
    throw new Error("Failed to save staff advance deduction.", { cause: error });
  }
}

export async function deleteStaffAdvanceDeduction(id: string) {
  try {
    await db.delete(staffAdvanceDeductions).where(eq(staffAdvanceDeductions.id, id));
    return await getStaffAdvanceDeductions();
  } catch (error) {
    console.error("Database action failed in deleteStaffAdvanceDeduction:", error);
    throw new Error("Failed to delete staff advance deduction.", { cause: error });
  }
}

// --- STAFF PROVIDENT FUND OPERATIONS (monthly payroll breakdown) ---
export async function getStaffProvidentFundRecords(): Promise<StaffProvidentFund[]> {
  try {
    const rows = await db.select().from(staffProvidentFund);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffProvidentFundRecords:", error);
    throw new Error("Failed to retrieve staff provident fund records.", { cause: error });
  }
}

export async function saveStaffProvidentFundRecord(record: StaffProvidentFund) {
  try {
    const id = record.id || `${record.empId}-${record.month}`;
    const complete = { ...record, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(staffProvidentFund).where(eq(staffProvidentFund.id, id));
    if (existing.length > 0) {
      await db.update(staffProvidentFund).set({ empId: complete.empId, data: dataString }).where(eq(staffProvidentFund.id, id));
    } else {
      await db.insert(staffProvidentFund).values({ id, empId: complete.empId, data: dataString });
    }
    return await getStaffProvidentFundRecords();
  } catch (error) {
    console.error("Database action failed in saveStaffProvidentFundRecord:", error);
    throw new Error("Failed to save staff provident fund record.", { cause: error });
  }
}

// --- STAFF ATTENDANCE ADJUSTMENT OPERATIONS (manual LOP override) ---
export async function getStaffAttendanceAdjustments(): Promise<StaffAttendanceAdjustment[]> {
  try {
    const rows = await db.select().from(staffAttendanceAdjustments);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffAttendanceAdjustments:", error);
    throw new Error("Failed to retrieve staff attendance adjustments.", { cause: error });
  }
}

export async function saveStaffAttendanceAdjustment(adjustment: StaffAttendanceAdjustment) {
  try {
    const id = adjustment.id || `${adjustment.empId}-${adjustment.month}`;
    const complete = { ...adjustment, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(staffAttendanceAdjustments).where(eq(staffAttendanceAdjustments.id, id));
    if (existing.length > 0) {
      await db.update(staffAttendanceAdjustments).set({ empId: complete.empId, data: dataString }).where(eq(staffAttendanceAdjustments.id, id));
    } else {
      await db.insert(staffAttendanceAdjustments).values({ id, empId: complete.empId, data: dataString });
    }
    return await getStaffAttendanceAdjustments();
  } catch (error) {
    console.error("Database action failed in saveStaffAttendanceAdjustment:", error);
    throw new Error("Failed to save staff attendance adjustment.", { cause: error });
  }
}

// --- STAFF BANK DETAIL OPERATIONS ---
export async function getStaffBankDetails(): Promise<StaffBankDetail[]> {
  try {
    const rows = await db.select().from(staffBankDetails);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffBankDetails:", error);
    throw new Error("Failed to retrieve staff bank details.", { cause: error });
  }
}

export async function saveStaffBankDetail(detail: StaffBankDetail) {
  try {
    const id = detail.id || String(Date.now());
    const complete = { ...detail, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(staffBankDetails).where(eq(staffBankDetails.id, id));
    if (existing.length > 0) {
      await db.update(staffBankDetails).set({ empId: complete.empId, data: dataString }).where(eq(staffBankDetails.id, id));
    } else {
      await db.insert(staffBankDetails).values({ id, empId: complete.empId, data: dataString });
    }
    return await getStaffBankDetails();
  } catch (error) {
    console.error("Database action failed in saveStaffBankDetail:", error);
    throw new Error("Failed to save staff bank detail.", { cause: error });
  }
}

// --- STAFF ATTENDANCE OPERATIONS ---
export async function getStaffAttendance(): Promise<StaffAttendance[]> {
  try {
    const rows = await db.select().from(staffAttendance);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffAttendance:", error);
    throw new Error("Failed to retrieve staff attendance.", { cause: error });
  }
}

export async function saveStaffAttendanceRecord(record: StaffAttendance) {
  try {
    const id = record.id || String(Date.now());
    const complete = { ...record, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(staffAttendance).where(eq(staffAttendance.id, id));
    if (existing.length > 0) {
      await db.update(staffAttendance).set({ empId: complete.empId, data: dataString }).where(eq(staffAttendance.id, id));
    } else {
      await db.insert(staffAttendance).values({ id, empId: complete.empId, data: dataString });
    }
    return await getStaffAttendance();
  } catch (error) {
    console.error("Database action failed in saveStaffAttendanceRecord:", error);
    throw new Error("Failed to save staff attendance record.", { cause: error });
  }
}

export async function deleteStaffAttendanceRecord(id: string) {
  try {
    await db.delete(staffAttendance).where(eq(staffAttendance.id, id));
    return await getStaffAttendance();
  } catch (error) {
    console.error("Database action failed in deleteStaffAttendanceRecord:", error);
    throw new Error("Failed to delete staff attendance record.", { cause: error });
  }
}

// --- STAFF HOLIDAY OPERATIONS ---
export async function getStaffHolidays(): Promise<StaffHoliday[]> {
  try {
    const rows = await db.select().from(staffHolidays);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getStaffHolidays:", error);
    throw new Error("Failed to retrieve staff holidays.", { cause: error });
  }
}

export async function saveStaffHoliday(holiday: StaffHoliday) {
  try {
    const id = holiday.id || String(Date.now());
    const complete = { ...holiday, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(staffHolidays).where(eq(staffHolidays.id, id));
    if (existing.length > 0) {
      await db.update(staffHolidays).set({ data: dataString }).where(eq(staffHolidays.id, id));
    } else {
      await db.insert(staffHolidays).values({ id, data: dataString });
    }
    return await getStaffHolidays();
  } catch (error) {
    console.error("Database action failed in saveStaffHoliday:", error);
    throw new Error("Failed to save staff holiday.", { cause: error });
  }
}

export async function deleteStaffHoliday(id: string) {
  try {
    await db.delete(staffHolidays).where(eq(staffHolidays.id, id));
    return await getStaffHolidays();
  } catch (error) {
    console.error("Database action failed in deleteStaffHoliday:", error);
    throw new Error("Failed to delete staff holiday.", { cause: error });
  }
}

// --- SALARY SLIP OPERATIONS ---
export async function getSalarySlips(): Promise<SalarySlipRecord[]> {
  try {
    const rows = await db.select().from(salarySlips);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getSalarySlips:", error);
    throw new Error("Failed to retrieve salary slips.", { cause: error });
  }
}

export async function saveSalarySlipRecord(slip: SalarySlipRecord) {
  try {
    const id = slip.id || slip.slipNumber;
    const complete = { ...slip, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(salarySlips).where(eq(salarySlips.id, id));
    if (existing.length > 0) {
      await db.update(salarySlips).set({ data: dataString, empId: complete.empId }).where(eq(salarySlips.id, id));
    } else {
      await db.insert(salarySlips).values({ id, empId: complete.empId, data: dataString });
    }
    return await getSalarySlips();
  } catch (error) {
    console.error("Database action failed in saveSalarySlipRecord:", error);
    throw new Error("Failed to save salary slip.", { cause: error });
  }
}

// --- SALARY SLIP AUDIT OPERATIONS (append-only) ---
export async function getSalarySlipAudits(): Promise<SalarySlipAuditRecord[]> {
  try {
    const rows = await db.select().from(salarySlipAudits);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getSalarySlipAudits:", error);
    throw new Error("Failed to retrieve salary slip audit trail.", { cause: error });
  }
}

export async function saveSalarySlipAuditRecord(entry: SalarySlipAuditRecord) {
  try {
    const id = entry.id || String(Date.now());
    const complete = { ...entry, id };
    const dataString = JSON.stringify(complete);
    await db.insert(salarySlipAudits).values({ id, empId: complete.empId, data: dataString });
    return await getSalarySlipAudits();
  } catch (error) {
    console.error("Database action failed in saveSalarySlipAuditRecord:", error);
    throw new Error("Failed to write salary slip audit entry.", { cause: error });
  }
}

// --- ALERT SETTINGS OPERATIONS (singleton row) ---
export const DEFAULT_ALERT_SETTINGS_ID = 'default';
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  id: DEFAULT_ALERT_SETTINGS_ID,
  reeferHybridServiceCycleDays: 40,
  reeferHybridReminderDays: [15, 7, 3],
  walkesWashingCycleDays: 15,
  walkesReminderDays: [7, 5, 3]
};

export async function getAlertSettings(): Promise<AlertSettings> {
  try {
    const rows = await db.select().from(alertSettings).where(eq(alertSettings.id, DEFAULT_ALERT_SETTINGS_ID));
    if (rows.length === 0) return DEFAULT_ALERT_SETTINGS;
    // Spread over the defaults so a settings row saved before a new field
    // existed still comes back complete, rather than missing a key.
    return { ...DEFAULT_ALERT_SETTINGS, ...JSON.parse(rows[0].data) };
  } catch (error) {
    console.error("Database query failed in getAlertSettings:", error);
    throw new Error("Failed to retrieve alert settings.", { cause: error });
  }
}

export async function saveAlertSettings(settings: Partial<AlertSettings>): Promise<AlertSettings> {
  try {
    const current = await getAlertSettings();
    const complete: AlertSettings = { ...current, ...settings, id: DEFAULT_ALERT_SETTINGS_ID };
    const dataString = JSON.stringify(complete);
    const existing = await db.select().from(alertSettings).where(eq(alertSettings.id, DEFAULT_ALERT_SETTINGS_ID));
    if (existing.length > 0) {
      await db.update(alertSettings).set({ data: dataString }).where(eq(alertSettings.id, DEFAULT_ALERT_SETTINGS_ID));
    } else {
      await db.insert(alertSettings).values({ id: DEFAULT_ALERT_SETTINGS_ID, data: dataString });
    }
    return complete;
  } catch (error) {
    console.error("Database action failed in saveAlertSettings:", error);
    throw new Error("Failed to save alert settings.", { cause: error });
  }
}

// --- DRIVER SALARY SLIP OPERATIONS ---
export async function getDriverSalarySlips(): Promise<DriverSalarySlipRecord[]> {
  try {
    const rows = await db.select().from(driverSalarySlips);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getDriverSalarySlips:", error);
    throw new Error("Failed to retrieve driver salary slips.", { cause: error });
  }
}

export async function saveDriverSalarySlipRecord(slip: DriverSalarySlipRecord) {
  try {
    const id = slip.id || slip.slipNumber;
    const complete = { ...slip, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(driverSalarySlips).where(eq(driverSalarySlips.id, id));
    if (existing.length > 0) {
      await db.update(driverSalarySlips).set({ data: dataString, driverId: complete.driverId }).where(eq(driverSalarySlips.id, id));
    } else {
      await db.insert(driverSalarySlips).values({ id, driverId: complete.driverId, data: dataString });
    }
    return await getDriverSalarySlips();
  } catch (error) {
    console.error("Database action failed in saveDriverSalarySlipRecord:", error);
    throw new Error("Failed to save driver salary slip.", { cause: error });
  }
}

// --- DRIVER SALARY SLIP AUDIT OPERATIONS (append-only) ---
export async function getDriverSalarySlipAudits(): Promise<DriverSalarySlipAuditRecord[]> {
  try {
    const rows = await db.select().from(driverSalarySlipAudits);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getDriverSalarySlipAudits:", error);
    throw new Error("Failed to retrieve driver salary slip audit trail.", { cause: error });
  }
}

export async function saveDriverSalarySlipAuditRecord(entry: DriverSalarySlipAuditRecord) {
  try {
    const id = entry.id || String(Date.now());
    const complete = { ...entry, id };
    const dataString = JSON.stringify(complete);
    await db.insert(driverSalarySlipAudits).values({ id, driverId: complete.driverId, data: dataString });
    return await getDriverSalarySlipAudits();
  } catch (error) {
    console.error("Database action failed in saveDriverSalarySlipAuditRecord:", error);
    throw new Error("Failed to write driver salary slip audit entry.", { cause: error });
  }
}

// --- SERVICE INVOICE OPERATIONS ---
export async function getServiceInvoices(): Promise<ServiceInvoiceRecord[]> {
  try {
    const rows = await db.select().from(serviceInvoices);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getServiceInvoices:", error);
    throw new Error("Failed to retrieve service invoices.", { cause: error });
  }
}

export async function saveServiceInvoiceRecord(invoice: ServiceInvoiceRecord) {
  try {
    const id = invoice.id || invoice.maintenanceRecordId;
    const complete = { ...invoice, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(serviceInvoices).where(eq(serviceInvoices.id, id));
    if (existing.length > 0) {
      await db.update(serviceInvoices).set({ data: dataString, regNo: complete.regNo }).where(eq(serviceInvoices.id, id));
    } else {
      await db.insert(serviceInvoices).values({ id, regNo: complete.regNo, data: dataString });
    }
    return await getServiceInvoices();
  } catch (error) {
    console.error("Database action failed in saveServiceInvoiceRecord:", error);
    throw new Error("Failed to save service invoice.", { cause: error });
  }
}

// --- SERVICE INVOICE AUDIT OPERATIONS (append-only) ---
export async function getServiceInvoiceAudits(): Promise<ServiceInvoiceAuditRecord[]> {
  try {
    const rows = await db.select().from(serviceInvoiceAudits);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getServiceInvoiceAudits:", error);
    throw new Error("Failed to retrieve service invoice audit trail.", { cause: error });
  }
}

export async function saveServiceInvoiceAuditRecord(entry: ServiceInvoiceAuditRecord) {
  try {
    const id = entry.id || String(Date.now());
    const complete = { ...entry, id };
    const dataString = JSON.stringify(complete);
    await db.insert(serviceInvoiceAudits).values({ id, regNo: complete.regNo, data: dataString });
    return await getServiceInvoiceAudits();
  } catch (error) {
    console.error("Database action failed in saveServiceInvoiceAuditRecord:", error);
    throw new Error("Failed to write service invoice audit entry.", { cause: error });
  }
}

// --- ABNORMAL LOGINS OPERATIONS ---
export async function getAbnormalLogins(): Promise<AbnormalLogin[]> {
  try {
    const rows = await db.select().from(abnormalLogins);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getAbnormalLogins:", error);
    throw new Error("Failed to retrieve abnormal logins.", { cause: error });
  }
}

export async function saveAbnormalLogin(log: AbnormalLogin) {
  try {
    const id = log.id || String(Date.now());
    const completeLog = { ...log, id };
    const dataString = JSON.stringify(completeLog);
    await db.insert(abnormalLogins).values({ id, data: dataString });
    return await getAbnormalLogins();
  } catch (error) {
    console.error("Database action failed in saveAbnormalLogin:", error);
    throw new Error("Failed to save abnormal login.", { cause: error });
  }
}

export async function resolveAllAbnormalLogins() {
  try {
    const logs = await getAbnormalLogins();
    for (const log of logs) {
      log.resolved = true;
      await db.update(abnormalLogins).set({ data: JSON.stringify(log) }).where(eq(abnormalLogins.id, log.id));
    }
    return await getAbnormalLogins();
  } catch (error) {
    console.error("Database action failed in resolveAllAbnormalLogins:", error);
    throw new Error("Failed to resolve abnormal logins.", { cause: error });
  }
}

// --- NOTIFICATION OPERATIONS ---
export async function getNotifications(): Promise<DashboardNotification[]> {
  try {
    const rows = await db.select().from(notifications);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getNotifications:", error);
    throw new Error("Failed to retrieve dashboard notifications.", { cause: error });
  }
}

export async function saveNotification(notif: DashboardNotification) {
  try {
    const id = notif.id || String(Date.now());
    const completeNotif = { ...notif, id };
    const dataString = JSON.stringify(completeNotif);

    const existing = await db.select().from(notifications).where(eq(notifications.id, id));
    if (existing.length > 0) {
      await db.update(notifications).set({ data: dataString }).where(eq(notifications.id, id));
    } else {
      await db.insert(notifications).values({ id, data: dataString });
    }
    return await getNotifications();
  } catch (error) {
    console.error("Database action failed in saveNotification:", error);
    throw new Error("Failed to save notification.", { cause: error });
  }
}

export async function resolveNotification(id: string) {
  try {
    const strId = String(id);
    const existing = await db.select().from(notifications).where(eq(notifications.id, strId));
    if (existing.length > 0) {
      const parsed = JSON.parse(existing[0].data);
      parsed.status = 'Resolved';
      parsed.read = true;
      await db.update(notifications).set({ data: JSON.stringify(parsed) }).where(eq(notifications.id, strId));
    } else {
      // Create new resolved notification record
      const newNotif: DashboardNotification = {
        id: strId,
        title: 'Alert Resolved',
        message: `Alert ${id} manually cleared by Super Admin.`,
        type: 'general',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        read: true
      };
      (newNotif as any).status = 'Resolved';
      await db.insert(notifications).values({ id: strId, data: JSON.stringify(newNotif) });
    }
    return await getNotifications();
  } catch (error) {
    console.error("Database action failed in resolveNotification:", error);
    throw new Error("Failed to resolve notification.", { cause: error });
  }
}

// --- WAREHOUSE ENTRY OPERATIONS ---
export async function getWarehouseEntries(): Promise<WarehouseEntry[]> {
  try {
    const rows = await db.select().from(warehouseEntries);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getWarehouseEntries:", error);
    throw new Error("Failed to retrieve warehouse entries.", { cause: error });
  }
}

export async function saveWarehouseEntry(entry: WarehouseEntry) {
  try {
    const id = entry.id || String(Date.now());
    const completeEntry = { ...entry, id };
    const dataString = JSON.stringify(completeEntry);

    const existing = await db.select().from(warehouseEntries).where(eq(warehouseEntries.id, id));
    if (existing.length > 0) {
      await db.update(warehouseEntries).set({ data: dataString }).where(eq(warehouseEntries.id, id));
    } else {
      await db.insert(warehouseEntries).values({ id, data: dataString });
    }
    return await getWarehouseEntries();
  } catch (error) {
    console.error("Database action failed in saveWarehouseEntry:", error);
    throw new Error("Failed to save warehouse entry.", { cause: error });
  }
}

export async function deleteWarehouseEntry(id: string) {
  try {
    await db.delete(warehouseEntries).where(eq(warehouseEntries.id, id));
    return await getWarehouseEntries();
  } catch (error) {
    console.error("Database action failed in deleteWarehouseEntry:", error);
    throw new Error("Failed to delete warehouse entry.", { cause: error });
  }
}

// --- MILEAGE REPORT OPERATIONS ---
export async function getMileageReports(): Promise<MileageReport[]> {
  try {
    const rows = await db.select().from(mileageReports);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getMileageReports:", error);
    throw new Error("Failed to retrieve mileage reports.", { cause: error });
  }
}

export async function saveMileageReport(report: MileageReport) {
  try {
    const id = report.id || String(Date.now());
    const completeReport = { ...report, id };
    const dataString = JSON.stringify(completeReport);

    const existing = await db.select().from(mileageReports).where(eq(mileageReports.id, id));
    if (existing.length > 0) {
      await db.update(mileageReports).set({ data: dataString }).where(eq(mileageReports.id, id));
    } else {
      await db.insert(mileageReports).values({ id, data: dataString });
    }
    return await getMileageReports();
  } catch (error) {
    console.error("Database action failed in saveMileageReport:", error);
    throw new Error("Failed to save mileage report.", { cause: error });
  }
}

export async function deleteMileageReport(id: string) {
  try {
    await db.delete(mileageReports).where(eq(mileageReports.id, id));
    return await getMileageReports();
  } catch (error) {
    console.error("Database action failed in deleteMileageReport:", error);
    throw new Error("Failed to delete mileage report.", { cause: error });
  }
}

// One-time migration: MileageReport gained a `totalLitres` field (Litres +
// Extra Fuel - a mid-trip top-up is real fuel that trip used) that
// Mileage/Cost-per-KM now compute from instead of the bare `litres` field.
// Backfills every existing row that doesn't have totalLitres set yet,
// recomputing totalLitres/mileage/costPerKm purely from that row's own
// already-stored fields (deterministic, no data loss) - safe to call on
// every boot, a no-op once every row has totalLitres.
//
// Deliberately does NOT touch difference/fuelAuditNote/remarks - those drive
// the fuel-theft audit's payroll deduction/credit wording, which may already
// have been acted on for past periods; silently recalculating those Rs
// figures after the fact could contradict a deduction/credit that already
// happened. They keep whatever was originally reported at entry time.
export async function migrateMileageReportTotalLitres() {
  try {
    const reports = await getMileageReports();
    const pending = reports.filter(r => r.totalLitres == null);
    if (pending.length === 0) return;

    for (const r of pending) {
      const litres = r.litres || 0;
      const extra = r.extraFuel || 0;
      const totalLitres = parseFloat((litres + extra).toFixed(2));
      const mileage = totalLitres > 0 ? parseFloat(((r.totalKm || 0) / totalLitres).toFixed(2)) : 0;
      const costPerKm = mileage > 0 ? parseFloat(((r.ratePerLitre || 0) / mileage).toFixed(2)) : 0;
      await saveMileageReport({ ...r, totalLitres, mileage, costPerKm });
    }

    console.log(`[MIGRATION] Backfilled totalLitres/mileage/costPerKm on ${pending.length} Mileage Report row(s).`);
  } catch (error) {
    console.error("Migration failed in migrateMileageReportTotalLitres:", error);
  }
}

// --- FUEL VENDOR (VENDOR MASTER) OPERATIONS ---
export async function getFuelVendors(): Promise<FuelVendor[]> {
  try {
    const rows = await db.select().from(fuelVendors);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getFuelVendors:", error);
    throw new Error("Failed to retrieve fuel vendors.", { cause: error });
  }
}

export async function saveFuelVendor(vendor: FuelVendor) {
  try {
    const id = vendor.id || String(Date.now());
    const completeVendor = { ...vendor, id };
    const dataString = JSON.stringify(completeVendor);

    const existing = await db.select().from(fuelVendors).where(eq(fuelVendors.id, id));
    if (existing.length > 0) {
      await db.update(fuelVendors).set({ data: dataString }).where(eq(fuelVendors.id, id));
    } else {
      await db.insert(fuelVendors).values({ id, data: dataString });
    }
    return await getFuelVendors();
  } catch (error) {
    console.error("Database action failed in saveFuelVendor:", error);
    throw new Error("Failed to save fuel vendor.", { cause: error });
  }
}

export async function deleteFuelVendor(id: string) {
  try {
    await db.delete(fuelVendors).where(eq(fuelVendors.id, id));
    return await getFuelVendors();
  } catch (error) {
    console.error("Database action failed in deleteFuelVendor:", error);
    throw new Error("Failed to delete fuel vendor.", { cause: error });
  }
}

// --- VEHICLE MILEAGE MASTER OPERATIONS ---
export async function getVehicleMileages(): Promise<VehicleMileage[]> {
  try {
    const rows = await db.select().from(vehicleMileage);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getVehicleMileages:", error);
    throw new Error("Failed to retrieve vehicle mileages.", { cause: error });
  }
}

export async function saveVehicleMileage(entry: VehicleMileage) {
  try {
    const id = entry.id || String(Date.now());
    const completeEntry = { ...entry, id };
    const dataString = JSON.stringify(completeEntry);

    const existing = await db.select().from(vehicleMileage).where(eq(vehicleMileage.id, id));
    if (existing.length > 0) {
      await db.update(vehicleMileage).set({ data: dataString }).where(eq(vehicleMileage.id, id));
    } else {
      await db.insert(vehicleMileage).values({ id, data: dataString });
    }
    return await getVehicleMileages();
  } catch (error) {
    console.error("Database action failed in saveVehicleMileage:", error);
    throw new Error("Failed to save vehicle mileage.", { cause: error });
  }
}

export async function deleteVehicleMileage(id: string) {
  try {
    await db.delete(vehicleMileage).where(eq(vehicleMileage.id, id));
    return await getVehicleMileages();
  } catch (error) {
    console.error("Database action failed in deleteVehicleMileage:", error);
    throw new Error("Failed to delete vehicle mileage.", { cause: error });
  }
}

// --- VENDOR MANAGEMENT OPERATIONS ---
export async function getVendors(): Promise<Vendor[]> {
  try {
    const rows = await db.select().from(vendors);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getVendors:", error);
    throw new Error("Failed to retrieve vendors.", { cause: error });
  }
}

export async function saveVendor(vendor: Vendor) {
  try {
    const id = vendor.id || String(Date.now());
    const completeVendor = { ...vendor, id };
    const dataString = JSON.stringify(completeVendor);

    const existing = await db.select().from(vendors).where(eq(vendors.id, id));
    if (existing.length > 0) {
      await db.update(vendors).set({ data: dataString }).where(eq(vendors.id, id));
    } else {
      await db.insert(vendors).values({ id, data: dataString });
    }
    return await getVendors();
  } catch (error) {
    console.error("Database action failed in saveVendor:", error);
    throw new Error("Failed to save vendor.", { cause: error });
  }
}

export async function deleteVendor(id: string) {
  try {
    await db.delete(vendors).where(eq(vendors.id, id));
    return await getVendors();
  } catch (error) {
    console.error("Database action failed in deleteVendor:", error);
    throw new Error("Failed to delete vendor.", { cause: error });
  }
}

// --- DRIVER DETAILS OPERATIONS ---
export async function getDriverEmployees(): Promise<DriverEmployee[]> {
  try {
    const rows = await db.select().from(driverEmployees);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getDriverEmployees:", error);
    throw new Error("Failed to retrieve driver employees.", { cause: error });
  }
}

export async function saveDriverEmployee(driver: DriverEmployee) {
  try {
    const id = driver.id || String(Date.now());
    const complete = { ...driver, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(driverEmployees).where(eq(driverEmployees.id, id));
    if (existing.length > 0) {
      await db.update(driverEmployees).set({ data: dataString }).where(eq(driverEmployees.id, id));
    } else {
      await db.insert(driverEmployees).values({ id, data: dataString });
    }
    return await getDriverEmployees();
  } catch (error) {
    console.error("Database action failed in saveDriverEmployee:", error);
    throw new Error("Failed to save driver employee.", { cause: error });
  }
}

export async function deleteDriverEmployee(id: string) {
  try {
    await db.delete(driverEmployees).where(eq(driverEmployees.id, id));
    return await getDriverEmployees();
  } catch (error) {
    console.error("Database action failed in deleteDriverEmployee:", error);
    throw new Error("Failed to delete driver employee.", { cause: error });
  }
}

export async function getDriverAttendance(): Promise<DriverAttendance[]> {
  try {
    const rows = await db.select().from(driverAttendance);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getDriverAttendance:", error);
    throw new Error("Failed to retrieve driver attendance.", { cause: error });
  }
}

export async function saveDriverAttendanceRecord(record: DriverAttendance) {
  try {
    const id = record.id || String(Date.now());
    const complete = { ...record, id };
    const dataString = JSON.stringify(complete);

    await db
      .insert(driverAttendance)
      .values({
        id,
        driverId: complete.driverId,
        data: dataString,
      })
      .onConflictDoUpdate({
        target: driverAttendance.id,
        set: {
          driverId: complete.driverId,
          data: dataString,
        },
      });

    return await getDriverAttendance();
  } catch (error) {
    console.error("Database action failed in saveDriverAttendanceRecord:", error);
    throw new Error("Failed to save driver attendance record.", { cause: error });
  }
}

export async function deleteDriverAttendanceRecord(id: string) {
  try {
    await db.delete(driverAttendance).where(eq(driverAttendance.id, id));
    return await getDriverAttendance();
  } catch (error) {
    console.error("Database action failed in deleteDriverAttendanceRecord:", error);
    throw new Error("Failed to delete driver attendance record.", { cause: error });
  }
}

export async function getVehicleLoans(): Promise<VehicleLoan[]> {
  try {
    const rows = await db.select().from(vehicleLoans);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getVehicleLoans:", error);
    throw new Error("Failed to retrieve vehicle loans.", { cause: error });
  }
}

export async function saveVehicleLoan(loan: VehicleLoan) {
  try {
    const id = loan.id || loan.regNo || String(Date.now());
    const complete = { ...loan, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(vehicleLoans).where(eq(vehicleLoans.id, id));
    if (existing.length > 0) {
      await db.update(vehicleLoans).set({ data: dataString }).where(eq(vehicleLoans.id, id));
    } else {
      await db.insert(vehicleLoans).values({ id, data: dataString });
    }
    return await getVehicleLoans();
  } catch (error) {
    console.error("Database action failed in saveVehicleLoan:", error);
    throw new Error("Failed to save vehicle loan.", { cause: error });
  }
}

export async function deleteVehicleLoan(id: string) {
  try {
    await db.delete(vehicleLoans).where(eq(vehicleLoans.id, id));
    return await getVehicleLoans();
  } catch (error) {
    console.error("Database action failed in deleteVehicleLoan:", error);
    throw new Error("Failed to delete vehicle loan.", { cause: error });
  }
}

export async function getBusinessLoans(): Promise<BusinessLoan[]> {
  try {
    const rows = await db.select().from(businessLoans);
    return rows.map(r => JSON.parse(r.data));
  } catch (error) {
    console.error("Database query failed in getBusinessLoans:", error);
    throw new Error("Failed to retrieve business loans.", { cause: error });
  }
}

export async function saveBusinessLoan(loan: BusinessLoan) {
  try {
    const id = loan.id || String(Date.now());
    const complete = { ...loan, id };
    const dataString = JSON.stringify(complete);

    const existing = await db.select().from(businessLoans).where(eq(businessLoans.id, id));
    if (existing.length > 0) {
      await db.update(businessLoans).set({ data: dataString }).where(eq(businessLoans.id, id));
    } else {
      await db.insert(businessLoans).values({ id, data: dataString });
    }
    return await getBusinessLoans();
  } catch (error) {
    console.error("Database action failed in saveBusinessLoan:", error);
    throw new Error("Failed to save business loan.", { cause: error });
  }
}

export async function deleteBusinessLoan(id: string) {
  try {
    await db.delete(businessLoans).where(eq(businessLoans.id, id));
    return await getBusinessLoans();
  } catch (error) {
    console.error("Database action failed in deleteBusinessLoan:", error);
    throw new Error("Failed to delete business loan.", { cause: error });
  }
}

// ---------------------------------------------------------------------------
// Audit Trail (see types.ts's AuditLog, db/schema.ts's auditLogs table,
// db/auditRedact.ts's redactSensitive). This is the only place in the app
// that ever writes to the audit_logs table - callers across server.ts pass
// in whatever old/new object they have; redaction happens once, here, so no
// call site can forget it.
// ---------------------------------------------------------------------------

export interface CreateAuditLogInput {
  // The acting user, straight from getSessionUser() - null/undefined for an
  // event with no resolvable session (e.g. a failed login for an
  // unrecognized account). usernameOverride covers that case: the attempted
  // login identifier, kept even though it never became a real session.
  user?: { username?: string; name?: string; department?: string } | null;
  usernameOverride?: string;
  action: AuditAction;
  module: string;
  entityType?: string;
  entityId?: string;
  description: string;
  oldData?: unknown; // raw object - redacted and JSON-stringified internally, never store pre-serialized
  newData?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

// Deliberately swallows its own errors (logged loudly via console.error, the
// same visibility every other function here already gets) rather than
// throwing - per the audit spec, a broken audit insert must never take down
// the real business operation that triggered it (a fuel entry save
// succeeding is more important than its own audit record succeeding). This
// is the one function in this file that intentionally does NOT rethrow.
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(auditLogs).values({
      id,
      createdAt: istTimestamp(),
      userId: input.user?.username || input.usernameOverride || null,
      userName: input.user?.name || null,
      userRole: input.user?.department || null,
      action: input.action,
      module: input.module,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      description: input.description,
      oldData: input.oldData !== undefined ? JSON.stringify(redactSensitive(input.oldData)) : null,
      newData: input.newData !== undefined ? JSON.stringify(redactSensitive(input.newData)) : null,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
    });
  } catch (error) {
    console.error('[AUDIT LOG FAILURE] Failed to record audit event - the triggering operation still completed.', {
      action: input.action, module: input.module, entityType: input.entityType, entityId: input.entityId, error
    });
  }
}

export interface AuditLogFilters {
  page?: number; // 1-based
  pageSize?: number; // capped at MAX_AUDIT_PAGE_SIZE regardless of what's requested
  sortDir?: 'asc' | 'desc'; // defaults to 'desc' (newest first)
  dateFrom?: string; // YYYY-MM-DD, inclusive
  dateTo?: string; // YYYY-MM-DD, inclusive
  userId?: string;
  userRole?: string;
  module?: string;
  action?: string;
  entityType?: string;
  q?: string; // keyword search across description/userName/entityId
}

const DEFAULT_AUDIT_PAGE_SIZE = 25;
const MAX_AUDIT_PAGE_SIZE = 2000; // export uses this ceiling too - see /api/audit-logs in server.ts

// Server-side filtered + paginated audit log query - the audit table is
// expected to grow large and is never pruned (see schema.ts's comment), so
// this never loads the full table into memory the way most of this file's
// other getX() functions do; every filter maps to a real indexed WHERE
// clause instead.
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<{ data: AuditLog[]; total: number }> {
  try {
    const conditions = [];
    if (filters.dateFrom) conditions.push(gte(auditLogs.createdAt, `${filters.dateFrom} 00:00:00`));
    if (filters.dateTo) conditions.push(lte(auditLogs.createdAt, `${filters.dateTo} 23:59:59`));
    if (filters.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters.userRole) conditions.push(eq(auditLogs.userRole, filters.userRole));
    if (filters.module) conditions.push(eq(auditLogs.module, filters.module));
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.entityType) conditions.push(eq(auditLogs.entityType, filters.entityType));
    if (filters.q && filters.q.trim()) {
      const like = `%${filters.q.trim()}%`;
      conditions.push(or(ilike(auditLogs.description, like), ilike(auditLogs.userName, like), ilike(auditLogs.entityId, like)));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const pageSize = Math.min(Math.max(Math.floor(filters.pageSize || DEFAULT_AUDIT_PAGE_SIZE), 1), MAX_AUDIT_PAGE_SIZE);
    const page = Math.max(Math.floor(filters.page || 1), 1);
    const offset = (page - 1) * pageSize;
    const orderFn = filters.sortDir === 'asc' ? asc : desc;

    let rowsQuery = db.select().from(auditLogs).orderBy(orderFn(auditLogs.createdAt)).limit(pageSize).offset(offset);
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(auditLogs);
    if (whereClause) {
      rowsQuery = rowsQuery.where(whereClause) as typeof rowsQuery;
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }
    const [rows, countRows] = await Promise.all([rowsQuery, countQuery]);

    const data: AuditLog[] = rows.map(r => ({
      id: r.id,
      createdAt: r.createdAt,
      userId: r.userId ?? undefined,
      userName: r.userName ?? undefined,
      userRole: r.userRole ?? undefined,
      action: r.action as AuditAction,
      module: r.module,
      entityType: r.entityType ?? undefined,
      entityId: r.entityId ?? undefined,
      description: r.description,
      oldData: r.oldData ?? undefined,
      newData: r.newData ?? undefined,
      ipAddress: r.ipAddress ?? undefined,
      userAgent: r.userAgent ?? undefined,
    }));
    return { data, total: Number(countRows[0]?.count || 0) };
  } catch (error) {
    console.error("Database query failed in getAuditLogs:", error);
    throw new Error("Failed to retrieve audit logs.", { cause: error });
  }
}

// Distinct values actually present in the table, for the Audit Trail UI's
// filter dropdowns (User/Module/Action/Entity Type) - cheap indexed
// DISTINCT scans, not a full-table load.
export async function getAuditLogFilterOptions(): Promise<{ users: { userId: string; userName: string }[]; modules: string[]; actions: string[]; entityTypes: string[] }> {
  try {
    const [userRows, moduleRows, actionRows, entityTypeRows] = await Promise.all([
      db.selectDistinct({ userId: auditLogs.userId, userName: auditLogs.userName }).from(auditLogs),
      db.selectDistinct({ module: auditLogs.module }).from(auditLogs),
      db.selectDistinct({ action: auditLogs.action }).from(auditLogs),
      db.selectDistinct({ entityType: auditLogs.entityType }).from(auditLogs),
    ]);
    return {
      users: userRows.filter(r => r.userId).map(r => ({ userId: r.userId as string, userName: r.userName || (r.userId as string) })),
      modules: moduleRows.map(r => r.module).filter(Boolean).sort(),
      actions: actionRows.map(r => r.action).filter(Boolean).sort(),
      entityTypes: entityTypeRows.map(r => r.entityType).filter((v): v is string => !!v).sort(),
    };
  } catch (error) {
    console.error("Database query failed in getAuditLogFilterOptions:", error);
    throw new Error("Failed to retrieve audit log filter options.", { cause: error });
  }
}


