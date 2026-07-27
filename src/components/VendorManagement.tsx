import React, { useState } from 'react';
import { Vendor, VehicleDocument } from '../types';
import { Building2, Plus, Search, Edit2, Trash2, X, Car } from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';

interface VendorManagementProps {
  vendors: Vendor[];
  onAddVendor: (vendor: Omit<Vendor, 'id'>) => Promise<void>;
  onUpdateVendor: (id: string, vendor: Partial<Vendor>) => Promise<void>;
  onDeleteVendor: (id: string) => Promise<void>;
}

interface FormErrors {
  name?: boolean;
  code?: boolean;
  vehicleNumbers?: boolean;
  contactNumber?: boolean;
  aadharNumber?: boolean;
  panNumber?: boolean;
  bankAccountNumber?: boolean;
  ifscCode?: boolean;
}

const emptyForm = {
  name: '', code: '', contactNumber: '', aadharNumber: '', panNumber: '',
  bankAccountNumber: '', ifscCode: ''
};

export default function VendorManagement({ vendors, onAddVendor, onUpdateVendor, onDeleteVendor }: VendorManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [vehicleNumbers, setVehicleNumbers] = useState<string[]>([]);
  const [vehicleInput, setVehicleInput] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [aadharDocuments, setAadharDocuments] = useState<VehicleDocument[]>([]);
  const [panDocuments, setPanDocuments] = useState<VehicleDocument[]>([]);
  const [rcDocuments, setRcDocuments] = useState<VehicleDocument[]>([]);
  const [bankStatementDocuments, setBankStatementDocuments] = useState<VehicleDocument[]>([]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setVehicleNumbers([]);
    setVehicleInput('');
    setErrors({});
    setAadharDocuments([]);
    setPanDocuments([]);
    setRcDocuments([]);
    setBankStatementDocuments([]);
    setShowModal(false);
  };

  const startEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setForm({
      name: vendor.name, code: vendor.code, contactNumber: vendor.contactNumber,
      aadharNumber: vendor.aadharNumber, panNumber: vendor.panNumber,
      bankAccountNumber: vendor.bankAccountNumber, ifscCode: vendor.ifscCode
    });
    setVehicleNumbers(vendor.vehicleNumbers || []);
    setVehicleInput('');
    setErrors({});
    setAadharDocuments(vendor.aadharDocuments || []);
    setPanDocuments(vendor.panDocuments || []);
    setRcDocuments(vendor.rcDocuments || []);
    setBankStatementDocuments(vendor.bankStatementDocuments || []);
    setShowModal(true);
  };

  const addVehicleNumber = () => {
    const v = vehicleInput.trim().toUpperCase();
    if (!v || vehicleNumbers.includes(v)) return;
    setVehicleNumbers([...vehicleNumbers, v]);
    setVehicleInput('');
  };

  const removeVehicleNumber = (v: string) => {
    setVehicleNumbers(vehicleNumbers.filter(n => n !== v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors: FormErrors = {
      name: !form.name.trim(),
      code: !form.code.trim(),
      vehicleNumbers: vehicleNumbers.length === 0,
      contactNumber: form.contactNumber.length !== 10,
      aadharNumber: form.aadharNumber.length !== 12,
      panNumber: form.panNumber.length !== 10,
      bankAccountNumber: !form.bankAccountNumber.trim(),
      ifscCode: !form.ifscCode.trim()
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    if (aadharDocuments.length === 0 || panDocuments.length === 0 || rcDocuments.length === 0 || bankStatementDocuments.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        vehicleNumbers,
        contactNumber: form.contactNumber,
        aadharNumber: form.aadharNumber,
        panNumber: form.panNumber,
        bankAccountNumber: form.bankAccountNumber.trim(),
        ifscCode: form.ifscCode.trim().toUpperCase(),
        aadharDocuments,
        panDocuments,
        rcDocuments,
        bankStatementDocuments
      };
      if (editingId) {
        await onUpdateVendor(editingId, payload);
      } else {
        await onAddVendor(payload);
      }
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (vendor: Vendor) => {
    if (window.confirm(`Delete vendor "${vendor.name}"? This action is irreversible.`)) {
      await onDeleteVendor(vendor.id);
    }
  };

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.vehicleNumbers || []).some(n => n.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-xs text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-indigo-100">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2.5 tracking-tight">
            <Building2 className="text-indigo-600 w-6 h-6" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-sky-700">
              Vendor Management
            </span>
          </h1>
          <p className="text-[11px] text-slate-500 mt-1 font-semibold">
            Vendor KYC and bank registry - connected to Fuel Entry's vehicle auto-fill.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-gradient-to-r from-indigo-500 to-sky-600 hover:from-indigo-600 hover:to-sky-700 text-xs text-white font-bold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4" /> Add Vendor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search by vendor name, code, or vehicle number..."
          autoComplete="off"
          className="flex-1 outline-none"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-indigo-900 via-slate-900 to-sky-900 text-indigo-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2.5">Vendor Name</th>
                <th className="px-3 py-2.5">Vendor Code</th>
                <th className="px-3 py-2.5">Vehicle Number(s)</th>
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Aadhar</th>
                <th className="px-3 py-2.5">PAN</th>
                <th className="px-3 py-2.5">Bank A/C</th>
                <th className="px-3 py-2.5">IFSC</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">No vendors found.</td></tr>
              ) : filtered.map(v => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{v.name}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600">{v.code}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(v.vehicleNumbers || []).map(n => (
                        <span key={n} className="bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">{n}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-600">{v.contactNumber}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{v.aadharNumber}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{v.panNumber}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{v.bankAccountNumber}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{v.ifscCode}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(v)} className="p-1 text-slate-500 hover:text-indigo-700 hover:bg-slate-100 rounded cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(v)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto relative">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 to-sky-600" />
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  {editingId ? 'Edit Vendor' : 'Add Vendor'}
                </h3>
                <button onClick={resetForm} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Vendor Name*</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    {errors.name && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Vendor Code*</label>
                    <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                      autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    {errors.code && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" /> Vehicle Number(s)*
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={vehicleInput}
                      onChange={e => setVehicleInput(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVehicleNumber(); } }}
                      placeholder="e.g. KA53AA0069"
                      autoComplete="off"
                      className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono uppercase"
                    />
                    <button type="button" onClick={addVehicleNumber} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 font-semibold text-[10px] uppercase cursor-pointer">Add</button>
                  </div>
                  {vehicleNumbers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {vehicleNumbers.map(n => (
                        <span key={n} className="bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-0.5 font-mono text-[10px] font-bold flex items-center gap-1">
                          {n}
                          <button type="button" onClick={() => removeVehicleNumber(n)} className="text-indigo-400 hover:text-rose-600 cursor-pointer"><X className="w-2.5 h-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {errors.vehicleNumbers && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                </div>

                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Contact Number* <span className="text-slate-400 font-normal">(10 digits)</span></label>
                  <input type="text" inputMode="numeric" value={form.contactNumber}
                    onChange={e => setForm({ ...form, contactNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    autoComplete="off" maxLength={10} className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                  {errors.contactNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Aadhar Number* <span className="text-slate-400 font-normal">(12 digits)</span></label>
                    <input type="text" inputMode="numeric" value={form.aadharNumber}
                      onChange={e => setForm({ ...form, aadharNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                      autoComplete="off" maxLength={12} placeholder="XXXXXXXXXXXX" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    {errors.aadharNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">PAN Number* <span className="text-slate-400 font-normal">(10 characters)</span></label>
                    <input value={form.panNumber} onChange={e => setForm({ ...form, panNumber: e.target.value.toUpperCase().slice(0, 10) })}
                      autoComplete="off" maxLength={10} placeholder="ABCDE1234F" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    {errors.panNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Bank Account Number*</label>
                    <input value={form.bankAccountNumber} onChange={e => setForm({ ...form, bankAccountNumber: e.target.value })}
                      autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    {errors.bankAccountNumber && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">IFSC Code*</label>
                    <input value={form.ifscCode} onChange={e => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
                      autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5" />
                    {errors.ifscCode && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Aadhar Document*</label>
                    <DocumentAttachment documents={aadharDocuments} onChange={setAadharDocuments} label="Attach Aadhar Card" hideDropzone maxFiles={1} />
                    {aadharDocuments.length === 0 && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">PAN Document*</label>
                    <DocumentAttachment documents={panDocuments} onChange={setPanDocuments} label="Attach PAN Card" hideDropzone maxFiles={1} />
                    {panDocuments.length === 0 && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">RC Document*</label>
                    <DocumentAttachment documents={rcDocuments} onChange={setRcDocuments} label="Attach RC" hideDropzone maxFiles={1} />
                    {rcDocuments.length === 0 && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-500 mb-1">Bank Statement*</label>
                    <DocumentAttachment documents={bankStatementDocuments} onChange={setBankStatementDocuments} label="Attach Bank Statement" hideDropzone maxFiles={1} />
                    {bankStatementDocuments.length === 0 && <p className="text-orange-500 font-semibold mt-1">Please fill out this*</p>}
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button type="button" onClick={resetForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 transition-colors uppercase text-[10px] cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-sky-600 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md transition-all uppercase text-[10px] cursor-pointer">
                    {isSubmitting ? 'Saving...' : editingId ? 'Update Vendor' : 'Save Vendor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
