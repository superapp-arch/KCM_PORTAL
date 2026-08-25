import React, { useMemo, useState } from 'react';
import { Landmark, Plus, ChevronDown, ChevronUp, Trash2, Edit2, CreditCard, Banknote, Wallet, X } from 'lucide-react';
import { User, FuelLog, BunkPaymentPeriod, BunkPayment } from '../types';
import DateInput from './DateInput';
import { SaveConfirmationModal, DeleteConfirmationModal } from './ConfirmationModal';

interface PaymentsProps {
  user: User;
  fuelLogs: FuelLog[];
  bunkPaymentPeriods: BunkPaymentPeriod[];
  onSaveBunkPaymentPeriod: (period: Omit<BunkPaymentPeriod, 'id'> & { id?: string }) => Promise<void>;
  onDeleteBunkPaymentPeriod: (id: string) => Promise<void>;
  bunkPayments: BunkPayment[];
  onAddBunkPayment: (payment: Omit<BunkPayment, 'id' | 'enteredBy'>) => Promise<void>;
  onDeleteBunkPayment: (id: string) => Promise<void>;
}

const PAYMENT_MODES: { value: BunkPayment['mode']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Netbanking' }
];

const MODE_ICON: Record<BunkPayment['mode'], React.ComponentType<{ className?: string }>> = {
  cash: Banknote, card: CreditCard, netbanking: Wallet
};

const MODE_BADGE_CLASS: Record<BunkPayment['mode'], string> = {
  cash: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  card: 'bg-blue-50 text-blue-700 border-blue-200',
  netbanking: 'bg-purple-50 text-purple-700 border-purple-200'
};

const bunkKey = (bunkName: string, location: string) => `${location}|||${bunkName}`;

export default function Payments({
  user, fuelLogs, bunkPaymentPeriods, onSaveBunkPaymentPeriod, onDeleteBunkPaymentPeriod,
  bunkPayments, onAddBunkPayment, onDeleteBunkPayment
}: PaymentsProps) {
  // Entered By (see BunkPayment.enteredBy) is visible only to Super Admins/
  // Principal - department 'super_admin' covers both (Principal's own
  // account is department 'super_admin' too, same as every other "Super
  // Admin / Principal only" gate in this app) - NOT Praveen, even though he
  // has module access. Server already strips the field for anyone else
  // (maskAttributionField), this just decides whether to render the column.
  const isSuperAdmin = user.department === 'super_admin';

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  // Set while editing an existing period (Period From/To - and the bunk
  // itself - stay fully editable after creation, per "not a fixed
  // system-wide cycle; set per entry and editable"); undefined = adding a
  // brand-new one. The same modal/form below handles both.
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodBunkKey, setPeriodBunkKey] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [isSubmittingPeriod, setIsSubmittingPeriod] = useState(false);

  const [payingPeriodId, setPayingPeriodId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<BunkPayment['mode']>('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };

  const [saveConfirmation, setSaveConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);

  // "Whatever bunks exist in Fuel Management" - derived straight from actual
  // FuelLog rows (not a separately-maintained list), so a bunk only shows up
  // here once it's genuinely been fueled at. (Location, Bunk Name) is the
  // real identity - the same bunk name can exist at more than one location
  // (e.g. HPCL at BLR/Chennai/Goa), each its own running account.
  const bunkOptions = useMemo(() => {
    const map = new Map<string, { bunkName: string; location: string }>();
    fuelLogs.forEach(l => {
      if (!l.bunkName || !l.location) return;
      map.set(bunkKey(l.bunkName, l.location), { bunkName: l.bunkName, location: l.location });
    });
    return Array.from(map.values()).sort((a, b) => a.bunkName.localeCompare(b.bunkName) || a.location.localeCompare(b.location));
  }, [fuelLogs]);

  // Total Amount is never stored - always summed live from Fuel Management's
  // own fuel entries for this bunk within the period's own dates, so it can
  // never drift into a second source of truth. Changing Period From/To
  // recalculates this instantly since it's plain derived state, not a
  // separate fetch.
  const totalAmountFor = (period: BunkPaymentPeriod): number =>
    fuelLogs
      .filter(l => l.bunkName === period.bunkName && l.location === period.location && l.date >= period.periodFrom && l.date <= period.periodTo)
      .reduce((s, l) => s + (l.amount || 0), 0);

  const paymentsFor = (periodId: string): BunkPayment[] =>
    bunkPayments.filter(p => p.bunkPeriodId === periodId).sort((a, b) => a.paidDate.localeCompare(b.paidDate));

  const amountPaidFor = (periodId: string): number => paymentsFor(periodId).reduce((s, p) => s + (p.amount || 0), 0);

  const resetPeriodForm = () => {
    setShowAddPeriod(false);
    setEditingPeriodId(null);
    setPeriodBunkKey('');
    setPeriodFrom('');
    setPeriodTo('');
  };

  const openEditPeriod = (period: BunkPaymentPeriod) => {
    setEditingPeriodId(period.id);
    setPeriodBunkKey(bunkKey(period.bunkName, period.location));
    setPeriodFrom(period.periodFrom);
    setPeriodTo(period.periodTo);
    setShowAddPeriod(true);
  };

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = bunkOptions.find(b => bunkKey(b.bunkName, b.location) === periodBunkKey);
    if (!selected || !periodFrom || !periodTo) {
      triggerNotif('Pick a Bunk and both Period dates.', 'error');
      return;
    }
    if (periodFrom > periodTo) {
      triggerNotif('Period From cannot be after Period To.', 'error');
      return;
    }
    setIsSubmittingPeriod(true);
    try {
      await onSaveBunkPaymentPeriod({
        id: editingPeriodId || undefined,
        bunkName: selected.bunkName, location: selected.location, periodFrom, periodTo
      });
      setSaveConfirmation({ label: 'Payment period', identifier: `${selected.bunkName} (${selected.location})`, key: Date.now() });
      resetPeriodForm();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to save payment period.', 'error');
    } finally {
      setIsSubmittingPeriod(false);
    }
  };

  const handleDeletePeriod = async (period: BunkPaymentPeriod) => {
    if (!confirm(`Delete the payment period for ${period.bunkName} (${period.location}), ${period.periodFrom} to ${period.periodTo}? This also removes its ${paymentsFor(period.id).length} logged payment(s). This cannot be undone.`)) return;
    try {
      await onDeleteBunkPaymentPeriod(period.id);
      setDeleteConfirmation({ label: 'Payment period', identifier: `${period.bunkName} (${period.location})`, key: Date.now() });
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete payment period.', 'error');
    }
  };

  const openAddPayment = (periodId: string) => {
    setPayingPeriodId(periodId);
    setPayAmount('');
    setPayMode('cash');
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingPeriodId) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0 || !payDate) {
      triggerNotif('Enter a valid Amount and Paid Date.', 'error');
      return;
    }
    setIsSubmittingPayment(true);
    try {
      await onAddBunkPayment({ bunkPeriodId: payingPeriodId, amount: amt, mode: payMode, paidDate: payDate });
      setSaveConfirmation({ label: 'Payment', identifier: `₹${amt.toLocaleString('en-IN')} (${PAYMENT_MODES.find(m => m.value === payMode)?.label})`, key: Date.now() });
      setPayingPeriodId(null);
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to log payment.', 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleDeletePayment = async (payment: BunkPayment) => {
    if (!confirm(`Delete this ₹${payment.amount.toLocaleString('en-IN')} ${payment.mode} payment logged on ${payment.paidDate}? This cannot be undone.`)) return;
    try {
      await onDeleteBunkPayment(payment.id);
      setDeleteConfirmation({ label: 'Payment', identifier: `₹${payment.amount.toLocaleString('en-IN')} (${PAYMENT_MODES.find(m => m.value === payment.mode)?.label})`, key: Date.now() });
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete payment.', 'error');
    }
  };

  const sortedPeriods = useMemo(
    () => [...bunkPaymentPeriods].sort((a, b) => b.periodTo.localeCompare(a.periodTo) || a.bunkName.localeCompare(b.bunkName)),
    [bunkPaymentPeriods]
  );

  return (
    <div className="space-y-6" id="payments-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <Landmark className="text-emerald-600 w-5 h-5" />
            Payments
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Reconciling what's owed to each fuel bunk against however many payments actually settle it - Bunk Name/Location/Total Amount all pulled straight from Fuel Management, never re-typed here.
          </p>
        </div>
        <button
          onClick={() => setShowAddPeriod(true)}
          className="mt-3 md:mt-0 bg-gradient-to-r from-emerald-600 to-teal-700 hover:shadow-md text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap w-fit"
        >
          <Plus className="w-4 h-4" /> Add Payment Period
        </button>
      </div>

      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold ${notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {notif.message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
              <tr>
                <th className="px-3 py-2.5 w-6"></th>
                <th className="px-3 py-2.5">Bunk Name</th>
                <th className="px-3 py-2.5">Location</th>
                <th className="px-3 py-2.5">Period</th>
                <th className="px-3 py-2.5 text-right">Total Amount</th>
                <th className="px-3 py-2.5">Payment Mode</th>
                <th className="px-3 py-2.5 text-right">Amount Paid</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5 text-center">Add Payment</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortedPeriods.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400 font-mono">NO PAYMENT PERIODS LOGGED YET.</td></tr>
              ) : sortedPeriods.map(period => {
                const totalAmount = totalAmountFor(period);
                const payments = paymentsFor(period.id);
                const amountPaid = amountPaidFor(period.id);
                const balance = parseFloat((totalAmount - amountPaid).toFixed(2));
                const modesUsed = Array.from(new Set(payments.map(p => p.mode)));
                const isExpanded = expandedId === period.id;
                return (
                  <React.Fragment key={period.id}>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5">
                        <button onClick={() => setExpandedId(isExpanded ? null : period.id)} className="text-slate-400 hover:text-slate-700 cursor-pointer" title="View payment history">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap">{period.bunkName}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{period.location}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{period.periodFrom} &rarr; {period.periodTo}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">₹{totalAmount.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {modesUsed.length === 0 ? (
                          <span className="text-slate-300">-</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            {modesUsed.map(m => PAYMENT_MODES.find(pm => pm.value === m)?.label).join(' + ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">₹{amountPaid.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-black whitespace-nowrap">
                        {balance > 0 ? <span className="text-rose-600">₹{balance.toLocaleString('en-IN')}</span> : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {/* Removed entirely (not just disabled) once Balance
                            reaches 0 - a fully settled period shouldn't
                            invite further payment entries. */}
                        {balance > 0 && (
                          <button
                            onClick={() => openAddPayment(period.id)}
                            className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Payment
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button onClick={() => openEditPeriod(period)} className="p-1 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit period (Bunk/dates)">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeletePeriod(period)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete payment period">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="bg-slate-50/60 px-6 py-3">
                          {payments.length === 0 ? (
                            <p className="text-[11px] text-slate-400 font-mono py-2">No payments logged against this period yet.</p>
                          ) : (
                            <table className="w-full text-left text-[11px] border-collapse">
                              <thead>
                                <tr className="text-slate-400 uppercase text-[9px] tracking-wide">
                                  <th className="pb-1.5 pr-4 font-bold">Mode</th>
                                  <th className="pb-1.5 pr-4 font-bold text-right">Amount</th>
                                  <th className="pb-1.5 pr-4 font-bold">Paid Date</th>
                                  {isSuperAdmin && <th className="pb-1.5 pr-4 font-bold">Entered By</th>}
                                  <th className="pb-1.5 pr-4 font-bold text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/70">
                                {payments.map(p => {
                                  const ModeIcon = MODE_ICON[p.mode];
                                  return (
                                    <tr key={p.id}>
                                      <td className="py-1.5 pr-4">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border inline-flex items-center gap-1 ${MODE_BADGE_CLASS[p.mode]}`}>
                                          <ModeIcon className="w-3 h-3" /> {PAYMENT_MODES.find(m => m.value === p.mode)?.label}
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-4 text-right font-mono font-bold text-slate-800">₹{p.amount.toLocaleString('en-IN')}</td>
                                      <td className="py-1.5 pr-4 font-mono text-slate-500">{p.paidDate}</td>
                                      {isSuperAdmin && <td className="py-1.5 pr-4 font-mono text-slate-500">{p.enteredBy || '-'}</td>}
                                      <td className="py-1.5 pr-4 text-center">
                                        <button onClick={() => handleDeletePayment(p)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete this payment">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Payment Period modal */}
      {showAddPeriod && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Landmark className="w-4 h-4 text-emerald-400" /> {editingPeriodId ? 'Edit Payment Period' : 'Add Payment Period'}</h3>
              <button onClick={resetPeriodForm} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSavePeriod} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Bunk *</label>
                <select
                  required
                  value={periodBunkKey}
                  onChange={(e) => setPeriodBunkKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                >
                  <option value="">Select a bunk...</option>
                  {bunkOptions.map(b => (
                    <option key={bunkKey(b.bunkName, b.location)} value={bunkKey(b.bunkName, b.location)}>{b.bunkName} ({b.location})</option>
                  ))}
                </select>
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">Pulled straight from Fuel Management - only bunks that actually have fuel entries logged.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Period From *</label>
                  <DateInput required value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Period To *</label>
                  <DateInput required value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 font-mono">Every bunk settles on its own cycle - set whatever From/To this one actually runs (e.g. 11th-20th, or a full calendar month).</p>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetPeriodForm} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmittingPeriod} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmittingPeriod ? 'Saving...' : editingPeriodId ? 'Save Changes' : 'Save Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment modal */}
      {payingPeriodId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-teal-950 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-teal-400" /> Add Payment</h3>
              <button onClick={() => setPayingPeriodId(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleAddPayment} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Amount *</label>
                <input
                  type="number" step="0.01" required min="0.01" autoFocus
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="₹ Amount"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Payment Mode *</label>
                  <select required value={payMode} onChange={(e) => setPayMode(e.target.value as BunkPayment['mode'])} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-800">
                    {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Paid Date *</label>
                  <DateInput required value={payDate} onChange={(e) => setPayDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 font-mono">This always adds a new payment line - it never overwrites a prior one, so split settlements (different amounts/modes/dates) just keep appending here.</p>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setPayingPeriodId(null)} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmittingPayment} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmittingPayment ? 'Saving...' : 'Add Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SaveConfirmationModal key={saveConfirmation?.key} open={!!saveConfirmation} label={saveConfirmation?.label || 'Entry'} identifier={saveConfirmation?.identifier} onDone={() => setSaveConfirmation(null)} />
      <DeleteConfirmationModal key={deleteConfirmation?.key} open={!!deleteConfirmation} label={deleteConfirmation?.label || 'Entry'} identifier={deleteConfirmation?.identifier} onDone={() => setDeleteConfirmation(null)} />
    </div>
  );
}
