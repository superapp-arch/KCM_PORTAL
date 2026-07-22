import React, { useState, useEffect } from 'react';
import SplashScreen from './components/SplashScreen';
import Login from './components/Login';
import Administration from './components/Administration';
import kcmLogo from './assets/images/logo.png';
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
  MileageReport
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
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [entries, setEntries] = useState<AccountsEntry[]>([]);
  const [employees, setEmployees] = useState<StaffEmployee[]>([]);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [warehouseEntries, setWarehouseEntries] = useState<WarehouseEntry[]>([]);
  const [mileageReports, setMileageReports] = useState<MileageReport[]>([]);

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
        maintRes,
        acctRes,
        hrRes,
        notifRes,
        warehouseRes,
        mileageRes
      ] = await Promise.all([
        fetch('/api/fleet'),
        fetch('/api/fuel'),
        fetch('/api/billing'),
        fetch('/api/petty-cash'),
        fetch('/api/maintenance'),
        fetch('/api/accounts'),
        fetch('/api/staff/employees'),
        fetch('/api/notifications'),
        fetch('/api/warehouse'),
        fetch('/api/mileage')
      ]);

      if (fleetRes.ok) setVehicles(await fleetRes.json());
      if (fuelRes.ok) setFuelLogs(await fuelRes.json());
      if (billingRes.ok) setInvoices(await billingRes.json());
      if (pettyRes.ok) setVouchers(await pettyRes.json());
      if (maintRes.ok) setRecords(await maintRes.json());
      if (acctRes.ok) setEntries(await acctRes.json());
      if (hrRes.ok) setEmployees(await hrRes.json());
      if (notifRes.ok) setNotifications(await notifRes.json());
      if (warehouseRes.ok) setWarehouseEntries(await warehouseRes.json());
      if (mileageRes.ok) setMileageReports(await mileageRes.json());
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
      const res = await fetch('/api/fuel', {
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
      const res = await fetch('/api/petty-cash', {
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
      const res = await fetch(`/api/petty-cash/${id}`, {
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
      const res = await fetch(`/api/petty-cash/${id}`, {
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
      const res = await fetch(`/api/staff/employees/${id}`, {
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
      const res = await fetch(`/api/staff/employees/${id}`, {
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
      const res = await fetch('/api/staff/employees', {
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
      const res = await fetch(`/api/fuel/${id}`, {
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

  const handleDeleteFuelLog = async (id: string) => {
    try {
      const res = await fetch(`/api/fuel/${id}`, {
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
      const res = await fetch('/api/warehouse', {
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
      const res = await fetch('/api/warehouse', {
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
      const res = await fetch(`/api/warehouse/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting warehouse entry:', err);
    }
  };

  const handleClearImportedPettyCash = async () => {
    try {
      const res = await fetch('/api/petty-cash/clear-imported', {
        method: 'POST'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error clearing imported petty cash:', err);
    }
  };

  const handleAddMileageReport = async (report: Omit<MileageReport, 'id'>) => {
    try {
      const res = await fetch('/api/mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error adding mileage report:', err);
    }
  };

  const handleUpdateMileageReport = async (id: string, report: Partial<MileageReport>) => {
    try {
      const res = await fetch('/api/mileage', {
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
      const res = await fetch(`/api/mileage/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error('Error deleting mileage report:', err);
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
        onDeleteFuelLog={handleDeleteFuelLog}
        onAddInvoice={handleAddInvoice}
        onUpdateInvoice={handleUpdateInvoice}
        onDeleteInvoice={handleDeleteInvoice}
        onAddVoucher={handleAddVoucher}
        onUpdateVoucher={handleUpdateVoucher}
        onDeleteVoucher={handleDeleteVoucher}
        onClearImportedPettyCash={handleClearImportedPettyCash}
        onAddMaintenanceRecord={handleAddMaintenanceRecord}
        onUpdateMaintenanceRecord={handleUpdateMaintenanceRecord}
        onDeleteMaintenanceRecord={handleDeleteMaintenanceRecord}
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
      />

      {/* Permanent lightly visible Company Watermark */}
      <div 
        className="fixed inset-0 pointer-events-none flex items-center justify-center z-[-10] overflow-hidden bg-transparent select-none"
        id="kcm-company-watermark"
      >
        <img 
          src={kcmLogo} 
          alt="KCM Company Watermark" 
          className="w-[300px] sm:w-[500px] md:w-[700px] object-contain opacity-[0.08]"
          referrerPolicy="no-referrer"
        />
      </div>
    </>
  );
}
