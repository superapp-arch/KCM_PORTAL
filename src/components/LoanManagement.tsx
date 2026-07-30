import React, { useState } from 'react';
import { Vehicle, VehicleLoan, BusinessLoan } from '../types';
import { Truck, Landmark } from 'lucide-react';
import VehicleLoanSheet from './loans/VehicleLoanSheet';
import BusinessLoanSheet from './loans/BusinessLoanSheet';

interface LoanManagementProps {
  vehicles: Vehicle[];
  vehicleLoans: VehicleLoan[];
  onAddVehicleLoan: (loan: Omit<VehicleLoan, 'id'> & { id: string }) => Promise<void>;
  onUpdateVehicleLoan: (id: string, loan: Partial<VehicleLoan>) => Promise<void>;
  onDeleteVehicleLoan: (id: string) => Promise<void>;
  businessLoans: BusinessLoan[];
  onAddBusinessLoan: (loan: Omit<BusinessLoan, 'id'>) => Promise<void>;
  onUpdateBusinessLoan: (id: string, loan: Partial<BusinessLoan>) => Promise<void>;
  onDeleteBusinessLoan: (id: string) => Promise<void>;
}

type ModuleTab = 'vehicle' | 'business';

export default function LoanManagement({
  vehicles, vehicleLoans, onAddVehicleLoan, onUpdateVehicleLoan, onDeleteVehicleLoan,
  businessLoans, onAddBusinessLoan, onUpdateBusinessLoan, onDeleteBusinessLoan
}: LoanManagementProps) {
  const [moduleTab, setModuleTab] = useState<ModuleTab>('vehicle');

  return (
    <div className="space-y-6" id="loan-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Landmark className="text-emerald-600 w-5 h-5" />
            Loan Management
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">Vehicle and business loan ledgers</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold w-fit">
        {([['vehicle', 'Vehicle Loan', Truck], ['business', 'Business Loan', Landmark]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setModuleTab(key)}
            className={`px-3.5 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              moduleTab === key ? 'bg-gradient-to-r from-teal-600 to-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {moduleTab === 'vehicle' && (
        <VehicleLoanSheet
          vehicles={vehicles}
          vehicleLoans={vehicleLoans}
          onAddVehicleLoan={onAddVehicleLoan}
          onUpdateVehicleLoan={onUpdateVehicleLoan}
          onDeleteVehicleLoan={onDeleteVehicleLoan}
        />
      )}
      {moduleTab === 'business' && (
        <BusinessLoanSheet
          businessLoans={businessLoans}
          onAddBusinessLoan={onAddBusinessLoan}
          onUpdateBusinessLoan={onUpdateBusinessLoan}
          onDeleteBusinessLoan={onDeleteBusinessLoan}
        />
      )}
    </div>
  );
}
