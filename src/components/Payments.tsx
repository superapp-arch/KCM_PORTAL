import React, { useMemo, useState } from 'react';
import { Landmark, Plus, ChevronDown, ChevronUp, Trash2, Edit2, CreditCard, Banknote, Wallet, X } from 'lucide-react';
import { User, FuelLog, BunkPaymentPeriod, BunkPayment } from '../types';
import DateInput from './DateInput';
import { SaveConfirmationModal, DeleteConfirmationModal } from './ConfirmationModal';

interface PaymentsProps {
  user: User;
  fuelLogs: FuelLog[];
  bunkPaymentPeriods: BunkPaymentPeriod[];
  onSaveBunkPaymentPeriod: (period: Omit<BunkPaymentPeriod, 'id'> & { id?: string }) => Promise<string | undefined>;
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
  // One merged modal now covers three entry points (see openCreatePeriod/
  // openEditPeriod/openAddPayment below): a brand-new period + optional
  // first payment, editing an existing period's own Bunk/dates, and logging
  // a further payment against an existing period. `periodLocked` is what
  // tells the three apart in the JSX - true only for "Add Payment" (Bunk/
  // Period stay fixed, only the payment fields matter there).
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodLocked, setPeriodLocked] = useState(false);
  const [periodBunkKey, setPeriodBunkKey] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  // Inline overlap-conflict error (point 4) - separate from the generic
  // toast notif below since it needs to sit right under the Period fields,
  // naming the conflicting existing period.
  const [periodError, setPeriodError] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<BunkPayment['mode']>('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmittingPeriod, setIsSubmittingPeriod] = useState(false);

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
  const totalAmountFor = (period: { bunkName: string; location: string; periodFrom: string; periodTo: string }): number =>
    fuelLogs
      .filter(l => l.bunkName === period.bunkName && l.location === period.location && l.date >= period.periodFrom && l.date <= period.periodTo)
      .reduce((s, l) => s + (l.amount || 0), 0);

  const paymentsFor = (periodId: string): BunkPayment[] =>
    bunkPayments.filter(p => p.bunkPeriodId === periodId).sort((a, b) => a.paidDate.localeCompare(b.paidDate));

  const amountPaidFor = (periodId: string): number => paymentsFor(periodId).reduce((s, p) => s + (p.amount || 0), 0);

  // A bunk's periods must be sequential/non-overlapping (point 4) - two
  // date ranges overlap the instant one starts on/before the other ends AND
  // ends on/after the other starts. Excludes the period being edited itself
  // (editingPeriodId), so re-saving a period's own unchanged dates never
  // flags itself as a conflict.
  const findOverlappingPeriod = (bunkName: string, location: string, from: string, to: string, excludeId?: string): BunkPaymentPeriod | undefined =>
    bunkPaymentPeriods.find(p => p.id !== excludeId && p.bunkName === bunkName && p.location === location && p.periodFrom <= to && p.periodTo >= from);

  const resetPeriodModal = () => {
    setShowPeriodModal(false);
    setEditingPeriodId(null);
    setPeriodLocked(false);
    setPeriodBunkKey('');
    setPeriodFrom('');
    setPeriodTo('');
    setPeriodError('');
    setPayAmount('');
    setPayMode('cash');
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  // Three entry points into the same merged modal (points 1-3):
  const openCreatePeriod = () => { resetPeriodModal(); setShowPeriodModal(true); };
  const openEditPeriod = (period: BunkPaymentPeriod) => {
    resetPeriodModal();
    setEditingPeriodId(period.id);
    setPeriodBunkKey(bunkKey(period.bunkName, period.location));
    setPeriodFrom(period.periodFrom);
    setPeriodTo(period.periodTo);
    setShowPeriodModal(true);
  };
  const openAddPayment = (period: BunkPaymentPeriod) => {
    resetPeriodModal();
    setEditingPeriodId(period.id);
    setPeriodLocked(true);
    setPeriodBunkKey(bunkKey(period.bunkName, period.location));
    setPeriodFrom(period.periodFrom);
    setPeriodTo(period.periodTo);
    setShowPeriodModal(true);
  };

  // Live Bunk/Period selection state, used by the modal for both the Total
  // Amount/Balance preview (points 1 and 3) and the save handler below.
  const selectedBunk = bunkOptions.find(b => bunkKey(b.bunkName, b.location) === periodBunkKey);
  const periodValid = !!selectedBunk && !!periodFrom && !!periodTo && periodFrom <= periodTo;
  const modalTotalAmount = periodValid ? totalAmountFor({ bunkName: selectedBunk!.bunkName, location: selectedBunk!.location, periodFrom, periodTo }) : 0;
  const modalAmountPaid = editingPeriodId ? amountPaidFor(editingPeriodId) : 0;
  const modalAmountDue = parseFloat((modalTotalAmount - modalAmountPaid).toFixed(2));

  const handleDeletePeriod = async (period: BunkPaymentPeriod) => {
    if (!confirm(`Delete the payment period for ${period.bunkName} (${period.location}), ${period.periodFrom} to ${period.periodTo}? This also removes its ${paymentsFor(period.id).length} logged payment(s). This cannot be undone.`)) return;
    try {
      await onDeleteBunkPaymentPeriod(period.id);
      setDeleteConfirmation({ label: 'Payment period', identifier: `${period.bunkName} (${period.location})`, key: Date.now() });
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete payment period.', 'error');
    }
  };

  // Merged save (points 1-3): saves the period (create or update - skipped
  // when periodLocked, i.e. this open was purely "Add Payment" against an
  // already-fixed period) and, only if an Amount was actually typed in,
  // also logs a payment against it - one submit, one flow. Leaving Amount
  // blank while creating/editing a period is fine (payment stays optional -
  // "register now, pay later").
  const handleSavePeriodAndPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPeriodError('');
    if (!selectedBunk || !periodFrom || !periodTo) {
      triggerNotif('Pick a Bunk and both Period dates.', 'error');
      return;
    }
    if (periodFrom > periodTo) {
      triggerNotif('Period From cannot be after Period To.', 'error');
      return;
    }
    if (!periodLocked) {
      const conflict = findOverlappingPeriod(selectedBunk.bunkName, selectedBunk.location, periodFrom, periodTo, editingPeriodId || undefined);
      if (conflict) {
        setPeriodError(`Overlaps an existing period for this bunk: ${conflict.periodFrom} → ${conflict.periodTo}. The next period must start after it ends.`);
        return;
      }
    }
    const amt = payAmount.trim() ? parseFloat(payAmount) : 0;
    if (payAmount.trim() && (!amt || amt <= 0)) {
      triggerNotif('Enter a valid payment Amount, or leave it blank to just save the period.', 'error');
      return;
    }
    if (payAmount.trim() && !payDate) {
      triggerNotif('Pick a Paid Date for the payment.', 'error');
      return;
    }

    setIsSubmittingPeriod(true);
    try {
      let periodId = editingPeriodId;
      if (!periodLocked) {
        periodId = (await onSaveBunkPaymentPeriod({
          id: editingPeriodId || undefined,
          bunkName: selectedBunk.bunkName, location: selectedBunk.location, periodFrom, periodTo
        })) || editingPeriodId;
      }
      if (amt > 0 && periodId) {
        await onAddBunkPayment({ bunkPeriodId: periodId, amount: amt, mode: payMode, paidDate: payDate });
      }
      setSaveConfirmation({
        label: amt > 0 ? 'Payment period + payment' : 'Payment period',
        identifier: amt > 0
          ? `${selectedBunk.bunkName} (${selectedBunk.location}) — ₹${amt.toLocaleString('en-IN')}`
          : `${selectedBunk.bunkName} (${selectedBunk.location})`,
        key: Date.now()
      });
      resetPeriodModal();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to save.', 'error');
    } finally {
      setIsSubmittingPeriod(false);
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
            Diesel Payments
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Reconciling what's owed to each fuel bunk against however many payments actually settle it - Bunk Name/Location/Total Amount all pulled straight from Fuel Management, never re-typed here.
          </p>
        </div>
        <button
          onClick={openCreatePeriod}
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
                        {balance > 0 ? <span className="text-rose-600">-₹{balance.toLocaleString('en-IN')}</span> : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {/* "Completed" once Balance reaches 0 (point 5) -
                            no button, no further payment action on a
                            settled entry. */}
                        {balance > 0 ? (
                          <button
                            onClick={() => openAddPayment(period)}
                            className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Payment
                          </button>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md font-bold text-[10px] inline-block">
                            Completed
                          </span>
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

      {/* Merged Add/Edit Payment Period + Add Payment modal (points 1-3) -
          one flow for all three entry points: a brand-new period (+
          optional first payment), editing an existing period's own Bunk/
          dates, and logging a further payment against a period that's
          already fixed (periodLocked - Bunk/Period shown but disabled). */}
      {showPeriodModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-400" />
                {periodLocked ? 'Add Payment' : editingPeriodId ? 'Edit Payment Period' : 'Add Payment Period'}
              </h3>
              <button onClick={resetPeriodModal} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSavePeriodAndPayment} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Bunk *</label>
                <select
                  required
                  disabled={periodLocked}
                  value={periodBunkKey}
                  onChange={(e) => { setPeriodBunkKey(e.target.value); setPeriodError(''); }}
                  className={`w-full border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 ${periodLocked ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50'}`}
                >
                  <option value="">Select a bunk...</option>
                  {bunkOptions.map(b => (
                    <option key={bunkKey(b.bunkName, b.location)} value={bunkKey(b.bunkName, b.location)}>{b.bunkName} ({b.location})</option>
                  ))}
                </select>
                {!periodLocked && <p className="text-[9px] text-slate-400 font-mono mt-0.5">Pulled straight from Fuel Management - only bunks that actually have fuel entries logged.</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Period From *</label>
                  <DateInput required disabled={periodLocked} value={periodFrom} onChange={(e) => { setPeriodFrom(e.target.value); setPeriodError(''); }} className={`w-full border border-slate-200 rounded-lg p-2 font-mono text-slate-800 ${periodLocked ? 'bg-slate-100' : 'bg-slate-50'}`} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Period To *</label>
                  <DateInput required disabled={periodLocked} value={periodTo} onChange={(e) => { setPeriodTo(e.target.value); setPeriodError(''); }} className={`w-full border border-slate-200 rounded-lg p-2 font-mono text-slate-800 ${periodLocked ? 'bg-slate-100' : 'bg-slate-50'}`} />
                </div>
              </div>
              {periodError ? (
                <p className="text-[10px] text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{periodError}</p>
              ) : !periodLocked && (
                <p className="text-[9px] text-slate-400 font-mono">Every bunk settles on its own cycle - set whatever From/To this one actually runs (e.g. 11th-20th, or a full calendar month). Periods for the same bunk can't overlap.</p>
              )}

              {/* Total Amount / Balance preview - appears the instant Bunk +
                  both Period dates are valid (point 1), no extra click. */}
              {periodValid && (
                <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center justify-between font-mono">
                  <span className="text-[9px] text-emerald-600 uppercase font-bold">{modalAmountPaid > 0 ? 'Balance' : 'Total Amount'}</span>
                  <span className="text-sm font-black text-emerald-800">{modalAmountPaid > 0 ? '-' : ''}₹{(modalAmountPaid > 0 ? modalAmountDue : modalTotalAmount).toLocaleString('en-IN')}</span>
                </div>
              )}

              {/* Add Payment fields, merged right into this same modal
                  (point 2) - optional while creating/editing a period
                  (register now, pay later is fine), the actual point of
                  the periodLocked "Add Payment" entry. */}
              {periodValid && (
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{periodLocked ? 'Log Payment' : 'Log a Payment (optional)'}</span>
                  <div>
                    <label className="block font-semibold text-slate-600 mb-1">Amount{periodLocked && <span className="text-rose-500"> *</span>}</label>
                    <input
                      type="number" step="0.01" min="0.01" required={periodLocked}
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="₹ Amount"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Payment Mode</label>
                      <select value={payMode} onChange={(e) => setPayMode(e.target.value as BunkPayment['mode'])} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-800">
                        {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">Paid Date</label>
                      <DateInput value={payDate} onChange={(e) => setPayDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 font-mono">Always adds a new payment line - never overwrites a prior one, so split settlements (different amounts/modes/dates) just keep appending here.</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetPeriodModal} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmittingPeriod} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmittingPeriod ? 'Saving...' : periodLocked ? 'Add Payment' : editingPeriodId ? 'Save Changes' : 'Save Period'}
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
