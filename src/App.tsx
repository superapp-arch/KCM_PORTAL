import React, { useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import Login from './components/Login';
import Administration from './components/Administration';
import { authFetch } from './authFetch';
import {
  User,
  Vehicle,
  FuelLog,
  BillingInvoice,
  PettyCashVoucher,
  MaintenanceRecord,
  AccountsEntry,
  StaffEmployee,
  DashboardNotification,
  WarehouseEntry,
  MileageReport,
  FuelVendor,
  VehicleMileage,
  Vendor,
  DriverEmployee,
  VehicleLoan,
  BusinessLoan,
  MarketPodEntry,
  PettyCashAdvance,
  MaintenanceServiceStation,
  BreakdownReport,
  VehicleServiceSchedule,
  TireBrand,
  TireRecord,
  BatteryRecord,
  ToolsChecklistRecord
} from './types';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Departmental Data Lists
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [vouchers, setVouchers] = useState<PettyCashVoucher[]>([]);
  const [marketPodEntries, setMarketPodEntries] = useState<MarketPodEntry[]>([]);
  const [pettyCashAdvances, setPettyCashAdvances] = useState<PettyCashAdvance[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [maintenanceServiceStations, setMaintenanceServiceStations] = useState<MaintenanceServiceStation[]>([]);
  const [breakdownReports, setBreakdownReports] = useState<BreakdownReport[]>([]);
  const [vehicleServiceSchedules, setVehicleServiceSchedules] = useState<VehicleServiceSchedule[]>([]);
  const [tireBrands, setTireBrands] = useState<TireBrand[]>([]);
  const [tireRecords, setTireRecords] = useState<TireRecord[]>([]);
  const [batteryRecords, setBatteryRecords] = useState<BatteryRecord[]>([]);
  const [toolsChecklistRecords, setToolsChecklistRecords] = useState<ToolsChecklistRecord[]>([]);
  const [entries, setEntries] = useState<AccountsEntry[]>([]);
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [warehouseEntries, setWarehouseEntries] = useState<WarehouseEntry[]>([]);
  const [mileageReports, setMileageReports] = useState<MileageReport[]>([]);
  const [fuelVendors, setFuelVendors] = useState<FuelVendor[]>([]);
  const [vehicleMileages, setVehicleMileages] = useState<VehicleMileage[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [drivers, setDrivers] = useState<DriverEmployee[]>([]);
  const [vehicleLoans, setVehicleLoans] = useState<VehicleLoan[]>([]);
  const [businessLoans, setBusinessLoans] = useState<BusinessLoan[]>([]);

  // 1. Initial Session Handshake
  // Restores strictly from THIS browser's own stored token - never from a
  // shared/global server session - so one employee logging in on their
  // machine can never surface on another employee's device.
  useEffect(() => {
    const initSession = async () => {
      try {
        const savedToken = localStorage.getItem('kcm_session_token');
        if (savedToken) {
          const res = await fetch('/api/session', {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          if (res.ok) {
            const sessionUser = await res.json();
            if (sessionUser && sessionUser.username) {
              setUser(sessionUser);
              setToken(savedToken);
              await fetchAllData();
            } else {
              // Token is stale/unknown to the server (e.g. server restarted) - clear it
              localStorage.removeItem('kcm_session_user');
              localStorage.removeItem('kcm_session_token');
            }
          }
        }
      } catch (err) {
        console.error('Session handshaking failed:', err);
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, []);

  // 2. Fetch All Departmental Datasets from Server
  const fetchAllData = async () => {
    try {
      const [
        fleetRes,
        fuelRes,
        billingRes,
        pettyRes,
        marketPodRes,
        pettyCashAdvancesRes,
        maintRes,
        maintenanceServiceStationsRes,
        breakdownReportsRes,
        vehicleServiceSchedulesRes,
        tireBrandsRes,
        tireRecordsRes,
        batteryRecordsRes,
        toolsChecklistRecordsRes,
        acctRes,
        hrRes,
        notifRes,
        warehouseRes,
        mileageRes,
        fuelVendorsRes,
        vehicleMileagesRes,
        vendorsRes,
        driversRes,
        vehicleLoansRes,
        businessLoansRes
      ] = await Promise.all([
        fetch('/api/fleet'),
        authFetch('/api/fuel'),
        fetch('/api/billing'),
        authFetch('/api/petty-cash'),
        authFetch('/api/market-pod'),
        authFetch('/api/petty-cash-advances'),
        fetch('/api/maintenance'),
        fetch('/api/maintenance-service-stations'),
        fetch('/api/breakdown-reports'),
        fetch('/api/vehicle-service-schedules'),
        fetch('/api/tire-brands'),
        fetch('/api/tire-records'),
        fetch('/api/battery-records'),
        fetch('/api/tools-checklist-records'),
        fetch('/api/accounts'),
        authFetch('/api/staff/employees'),
        fetch('/api/notifications'),
        authFetch('/api/warehouse'),
        authFetch('/api/mileage'),
        authFetch('/api/fuel-vendors'),
        authFetch('/api/vehicle-mileage'),
        authFetch('/api/vendors'),
        authFetch('/api/drivers/employees'),
        authFetch('/api/vehicle-loans'),
        authFetch('/api/business-loans')
      ]);

      if (fleetRes.ok) setVehicles(await fleetRes.json());
      if (fuelRes.ok) setFuelLogs(await fuelRes.json());
      if (billingRes.ok) setInvoices(await billingRes.json());
      if (pettyRes.ok) setVouchers(await pettyRes.json());
      if (marketPodRes.ok) setMarketPodEntries(await marketPodRes.json());
      if (pettyCashAdvancesRes.ok) setPettyCashAdvances(await pettyCashAdvancesRes.json());
      if (maintRes.ok) setRecords(await maintRes.json());
      if (maintenanceServiceStationsRes.ok) setMaintenanceServiceStations(await maintenanceServiceStationsRes.json());
      if (breakdownReportsRes.ok) setBreakdownReports(await breakdownReportsRes.json());
      if (vehicleServiceSchedulesRes.ok) setVehicleServiceSchedules(await vehicleServiceSchedulesRes.json());
      if (tireBrandsRes.ok) setTireBrands(await tireBrandsRes.json());
      if (tireRecordsRes.ok) setTireRecords(await tireRecordsRes.json());
      if (batteryRecordsRes.ok) setBatteryRecords(await batteryRecordsRes.json());
      if (toolsChecklistRecordsRes.ok) setToolsChecklistRecords(await toolsChecklistRecordsRes.json());
      if (acctRes.ok) setEntries(await acctRes.json());
      if (hrRes.ok) setEmployees(await hrRes.json());
      if (notifRes.ok) setNotifications(await notifRes.json());
      if (warehouseRes.ok) setWarehouseEntries(await warehouseRes.json());
      if (mileageRes.ok) setMileageReports(await mileageRes.json());
      if (fuelVendorsRes.ok) setFuelVendors(await fuelVendorsRes.json());
      if (vehicleMileagesRes.ok) setVehicleMileages(await vehicleMileagesRes.json());
      if (vendorsRes.ok) setVendors(await vendorsRes.json());
      if (driversRes.ok) setDrivers(await driversRes.json());
      if (vehicleLoansRes.ok) setVehicleLoans(await vehicleLoansRes.json());
      if (businessLoansRes.ok) setBusinessLoans(await businessLoansRes.json());
    } catch (err) {
      console.error('Failed to populate core ledgers:', err);
    }
  };

  // State mutation wrappers to talk directly to server
  const handleUpdateVehicle = async (vehicle: Vehicle) => {
    try {
      const res = await fetch('/api/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicle)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error saving/updating vehicle:', err);
    }
  };

  const handleAddFuelLog = async (log: Omit<FuelLog, 'id'>) => {
    try {
      const res = await authFetch('/api/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddInvoice = async (inv: Omit<BillingInvoice, 'id'>) => {
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inv)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddVoucher = async (voucher: Omit<PettyCashVoucher, 'id'>) => {
    try {
      const res = await authFetch('/api/petty-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voucher)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateVoucher = async (id: string, voucher: Partial<PettyCashVoucher>) => {
    try {
      const res = await authFetch(`/api/petty-cash/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voucher)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteVoucher = async (id: string) => {
    try {
      const res = await authFetch(`/api/petty-cash/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMarketPodEntry = async (entry: Omit<MarketPodEntry, 'id'>) => {
    try {
      const res = await authFetch('/api/market-pod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateMarketPodEntry = async (id: string, entry: Partial<MarketPodEntry>) => {
    try {
      const res = await authFetch(`/api/market-pod/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMarketPodEntry = async (id: string) => {
    try {
      const res = await authFetch(`/api/market-pod/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPettyCashAdvance = async (advance: Omit<PettyCashAdvance, 'id'>) => {
    try {
      const res = await authFetch('/api/petty-cash-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(advance)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePettyCashAdvance = async (id: string) => {
    try {
      const res = await authFetch(`/api/petty-cash-advances/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMaintenanceRecord = async (record: Omit<MaintenanceRecord, 'id'>) => {
    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveVehicleServiceSchedule = async (schedule: VehicleServiceSchedule) => {
    try {
      const res = await fetch('/api/vehicle-service-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTireBrand = async (name: string) => {
    try {
      const res = await fetch('/api/tire-brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveTireRecord = async (record: TireRecord | Omit<TireRecord, 'id'>) => {
    try {
      const res = await fetch('/api/tire-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTireRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/tire-records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveBatteryRecord = async (record: BatteryRecord | Omit<BatteryRecord, 'id'>) => {
    try {
      const res = await fetch('/api/battery-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBatteryRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/battery-records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveToolsChecklistRecord = async (record: Omit<ToolsChecklistRecord, 'id'>) => {
    try {
      const res = await fetch('/api/tools-checklist-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteToolsChecklistRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/tools-checklist-records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMaintenanceServiceStation = async (station: Omit<MaintenanceServiceStation, 'id'>) => {
    try {
      const res = await fetch('/api/maintenance-service-stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(station)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMaintenanceServiceStation = async (id: string) => {
    try {
      const res = await fetch(`/api/maintenance-service-stations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddBreakdownReport = async (report: Omit<BreakdownReport, 'id'>) => {
    try {
      const res = await fetch('/api/breakdown-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateBreakdownReport = async (id: string, report: Partial<BreakdownReport>) => {
    try {
      const res = await fetch(`/api/breakdown-reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBreakdownReport = async (id: string) => {
    try {
      const res = await fetch(`/api/breakdown-reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAccountsEntry = async (entry: Omit<AccountsEntry, 'id'>) => {
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateEmployee = async (id: string, emp: Partial<StaffEmployee>) => {
    try {
      const res = await authFetch(`/api/staff/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating employee:', err);
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    try {
      const res = await authFetch(`/api/staff/employees/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting employee:', err);
    }
  };

  const handleAddEmployee = async (emp: Omit<StaffEmployee, 'id'> & { id: string }) => {
    try {
      const res = await authFetch('/api/staff/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(emp);
    }
  };

  const handleAddDriver = async (driver: Omit<DriverEmployee, 'id'> & { id: string }) => {
    try {
      const res = await authFetch('/api/drivers/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driver)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding driver:', err);
    }
  };

  const handleUpdateDriver = async (id: string, driver: Partial<DriverEmployee>) => {
    try {
      const res = await authFetch(`/api/drivers/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driver)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating driver:', err);
    }
  };

  const handleDeleteDriver = async (id: string) => {
    try {
      const res = await authFetch(`/api/drivers/employees/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting driver:', err);
    }
  };

  const handleAddVehicleLoan = async (loan: Omit<VehicleLoan, 'id'> & { id: string }) => {
    try {
      const res = await authFetch('/api/vehicle-loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loan)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding vehicle loan:', err);
    }
  };

  const handleUpdateVehicleLoan = async (id: string, loan: Partial<VehicleLoan>) => {
    try {
      const res = await authFetch(`/api/vehicle-loans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loan)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating vehicle loan:', err);
    }
  };

  const handleDeleteVehicleLoan = async (id: string) => {
    try {
      const res = await authFetch(`/api/vehicle-loans/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting vehicle loan:', err);
    }
  };

  const handleAddBusinessLoan = async (loan: Omit<BusinessLoan, 'id'>) => {
    try {
      const res = await authFetch('/api/business-loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loan)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding business loan:', err);
    }
  };

  const handleUpdateBusinessLoan = async (id: string, loan: Partial<BusinessLoan>) => {
    try {
      const res = await authFetch(`/api/business-loans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loan)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating business loan:', err);
    }
  };

  const handleDeleteBusinessLoan = async (id: string) => {
    try {
      const res = await authFetch(`/api/business-loans/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting business loan:', err);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    try {
      const res = await fetch(`/api/fleet/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting vehicle:', err);
    }
  };

  const handleUpdateFuelLog = async (id: string, log: Partial<FuelLog>) => {
    try {
      const res = await authFetch(`/api/fuel/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating fuel log:', err);
    }
  };

  // Divya's restricted RQ-ID-only update path - see requireFuelAccess/
  // FUEL_RQ_ID_ONLY_EMAILS in server.ts.
  const handleUpdateFuelLogRqId = async (id: string, rqId: string) => {
    try {
      const res = await authFetch(`/api/fuel/${id}/rq-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rqId })
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating fuel log RQ ID:', err);
    }
  };

  const handleDeleteFuelLog = async (id: string) => {
    try {
      const res = await authFetch(`/api/fuel/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting fuel log:', err);
    }
  };

  const handleUpdateInvoice = async (id: string, inv: Partial<BillingInvoice>) => {
    try {
      const res = await fetch(`/api/billing/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inv)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating invoice:', err);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    try {
      const res = await fetch(`/api/billing/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting invoice:', err);
    }
  };

  const handleUpdateMaintenanceRecord = async (id: string, record: Partial<MaintenanceRecord>) => {
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating maintenance record:', err);
    }
  };

  const handleDeleteMaintenanceRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/maintenance/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting maintenance record:', err);
    }
  };

  const handleUpdateAccountsEntry = async (id: string, entry: Partial<AccountsEntry>) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating accounts entry:', err);
    }
  };

  const handleDeleteAccountsEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting accounts entry:', err);
    }
  };

  const handleResolveNotification = async (notifId: string) => {
    try {
      const res = await fetch('/api/notifications/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notifId })
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendComplianceDigestNow = async (): Promise<{ success: boolean; sent?: boolean; message?: string; error?: string }> => {
    try {
      const res = await fetch('/api/compliance-digest/send-now', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchAllData();
      }
      return data;
    } catch (err) {
      console.error(err);
      return { success: false, error: 'Failed to reach the server.' };
    }
  };

  const handleAddWarehouseEntry = async (entry: Omit<WarehouseEntry, 'id'>) => {
    try {
      const res = await authFetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding warehouse entry:', err);
    }
  };

  const handleUpdateWarehouseEntry = async (id: string, entry: Partial<WarehouseEntry>) => {
    try {
      const res = await authFetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, id })
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating warehouse entry:', err);
    }
  };

  const handleDeleteWarehouseEntry = async (id: string) => {
    try {
      const res = await authFetch(`/api/warehouse/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting warehouse entry:', err);
    }
  };

  // Returns the newly created report's id (server generates and echoes it
  // back) - Fuel Entry's combined form needs this to link the fuel log it
  // saves alongside a mileage entry (see FuelLog.mileageReportId).
  const handleAddMileageReport = async (report: Omit<MileageReport, 'id'>): Promise<string | undefined> => {
    try {
      const res = await authFetch('/api/mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      if (res.ok) {
        const data = await res.json();
        await fetchAllData();
        return data.id as string | undefined;
      }
    } catch (err) {
      console.error('Error adding mileage report:', err);
    }
    return undefined;
  };

  const handleUpdateMileageReport = async (id: string, report: Partial<MileageReport>) => {
    try {
      const res = await authFetch('/api/mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, id })
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating mileage report:', err);
    }
  };

  const handleDeleteMileageReport = async (id: string) => {
    try {
      const res = await authFetch(`/api/mileage/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting mileage report:', err);
    }
  };

  const handleAddFuelVendor = async (vendor: Omit<FuelVendor, 'id'>) => {
    try {
      const res = await authFetch('/api/fuel-vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding fuel vendor:', err);
    }
  };

  const handleDeleteFuelVendor = async (id: string) => {
    try {
      const res = await authFetch(`/api/fuel-vendors/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting fuel vendor:', err);
    }
  };

  const handleAddVehicleMileage = async (entry: Omit<VehicleMileage, 'id'>) => {
    try {
      const res = await authFetch('/api/vehicle-mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding vehicle mileage:', err);
    }
  };

  const handleUpdateVehicleMileage = async (id: string, entry: Partial<VehicleMileage>) => {
    try {
      const res = await authFetch(`/api/vehicle-mileage/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating vehicle mileage:', err);
    }
  };

  const handleDeleteVehicleMileage = async (id: string) => {
    try {
      const res = await authFetch(`/api/vehicle-mileage/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting vehicle mileage:', err);
    }
  };

  const handleAddVendor = async (vendor: Omit<Vendor, 'id'>) => {
    try {
      const res = await authFetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding vendor:', err);
    }
  };

  const handleUpdateVendor = async (id: string, vendor: Partial<Vendor>) => {
    try {
      const res = await authFetch(`/api/vendors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error updating vendor:', err);
    }
  };

  const handleDeleteVendor = async (id: string) => {
    try {
      const res = await authFetch(`/api/vendors/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting vendor:', err);
    }
  };

  const handleLoginSuccess = async (loggedInUser: User, sessionToken?: string) => {
    setUser(loggedInUser);
    if (sessionToken) setToken(sessionToken);
    await fetchAllData();
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('kcm_session_user');
    localStorage.removeItem('kcm_session_token');
  };

  // 3. Render State Selector
  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-300 font-sans">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-xs uppercase tracking-widest font-semibold font-mono text-slate-400">
          Syncing secure KCM log journals...
        </span>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <Administration
        user={user}
        token={token}
        onLogout={handleLogout}
        vehicles={vehicles}
        fuelLogs={fuelLogs}
        invoices={invoices}
        vouchers={vouchers}
        records={records}
        entries={entries}
        employees={employees}
        notifications={notifications}
        warehouseEntries={warehouseEntries}
        mileageReports={mileageReports}
        onUpdateVehicle={handleUpdateVehicle}
        onDeleteVehicle={handleDeleteVehicle}
        onAddFuelLog={handleAddFuelLog}
        onUpdateFuelLog={handleUpdateFuelLog}
        onUpdateFuelLogRqId={handleUpdateFuelLogRqId}
        onDeleteFuelLog={handleDeleteFuelLog}
        onAddInvoice={handleAddInvoice}
        onUpdateInvoice={handleUpdateInvoice}
        onDeleteInvoice={handleDeleteInvoice}
        onAddVoucher={handleAddVoucher}
        onUpdateVoucher={handleUpdateVoucher}
        onDeleteVoucher={handleDeleteVoucher}
        marketPodEntries={marketPodEntries}
        onAddMarketPodEntry={handleAddMarketPodEntry}
        onUpdateMarketPodEntry={handleUpdateMarketPodEntry}
        onDeleteMarketPodEntry={handleDeleteMarketPodEntry}
        pettyCashAdvances={pettyCashAdvances}
        onAddPettyCashAdvance={handleAddPettyCashAdvance}
        onDeletePettyCashAdvance={handleDeletePettyCashAdvance}
        onAddMaintenanceRecord={handleAddMaintenanceRecord}
        onUpdateMaintenanceRecord={handleUpdateMaintenanceRecord}
        onDeleteMaintenanceRecord={handleDeleteMaintenanceRecord}
        vehicleServiceSchedules={vehicleServiceSchedules}
        onSaveVehicleServiceSchedule={handleSaveVehicleServiceSchedule}
        tireBrands={tireBrands}
        onAddTireBrand={handleAddTireBrand}
        tireRecords={tireRecords}
        onSaveTireRecord={handleSaveTireRecord}
        onDeleteTireRecord={handleDeleteTireRecord}
        batteryRecords={batteryRecords}
        onSaveBatteryRecord={handleSaveBatteryRecord}
        onDeleteBatteryRecord={handleDeleteBatteryRecord}
        toolsChecklistRecords={toolsChecklistRecords}
        onSaveToolsChecklistRecord={handleSaveToolsChecklistRecord}
        onDeleteToolsChecklistRecord={handleDeleteToolsChecklistRecord}
        maintenanceServiceStations={maintenanceServiceStations}
        onAddMaintenanceServiceStation={handleAddMaintenanceServiceStation}
        onDeleteMaintenanceServiceStation={handleDeleteMaintenanceServiceStation}
        breakdownReports={breakdownReports}
        onAddBreakdownReport={handleAddBreakdownReport}
        onUpdateBreakdownReport={handleUpdateBreakdownReport}
        onDeleteBreakdownReport={handleDeleteBreakdownReport}
        onAddAccountsEntry={handleAddAccountsEntry}
        onUpdateAccountsEntry={handleUpdateAccountsEntry}
        onDeleteAccountsEntry={handleDeleteAccountsEntry}
        onAddEmployee={handleAddEmployee}
        onUpdateEmployee={handleUpdateEmployee}
        onDeleteEmployee={handleDeleteEmployee}
        onResolveNotification={handleResolveNotification}
        onSendComplianceDigestNow={handleSendComplianceDigestNow}
        onAddWarehouseEntry={handleAddWarehouseEntry}
        onUpdateWarehouseEntry={handleUpdateWarehouseEntry}
        onDeleteWarehouseEntry={handleDeleteWarehouseEntry}
        onAddMileageReport={handleAddMileageReport}
        onUpdateMileageReport={handleUpdateMileageReport}
        onDeleteMileageReport={handleDeleteMileageReport}
        fuelVendors={fuelVendors}
        onAddFuelVendor={handleAddFuelVendor}
        onDeleteFuelVendor={handleDeleteFuelVendor}
        vehicleMileages={vehicleMileages}
        onAddVehicleMileage={handleAddVehicleMileage}
        onUpdateVehicleMileage={handleUpdateVehicleMileage}
        onDeleteVehicleMileage={handleDeleteVehicleMileage}
        vendors={vendors}
        onAddVendor={handleAddVendor}
        onUpdateVendor={handleUpdateVendor}
        onDeleteVendor={handleDeleteVendor}
        drivers={drivers}
        onAddDriver={handleAddDriver}
        onUpdateDriver={handleUpdateDriver}
        onDeleteDriver={handleDeleteDriver}
        vehicleLoans={vehicleLoans}
        onAddVehicleLoan={handleAddVehicleLoan}
        onUpdateVehicleLoan={handleUpdateVehicleLoan}
        onDeleteVehicleLoan={handleDeleteVehicleLoan}
        businessLoans={businessLoans}
        onAddBusinessLoan={handleAddBusinessLoan}
        onUpdateBusinessLoan={handleUpdateBusinessLoan}
        onDeleteBusinessLoan={handleDeleteBusinessLoan}
      />
    </>
  );
}
