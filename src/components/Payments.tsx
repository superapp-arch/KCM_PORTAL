import React, { useMemo, useState } from 'react';
import {
  Landmark, Plus, ArrowLeft, Trash2, Edit2, CreditCard, Banknote, Wallet, X,
  Wallet2, Building2, TrendingDown
} from 'lucide-react';
import { User, FuelLog, DieselBunkAccount, DieselBunkPayment } from '../types';
import DateInput from './DateInput';
import { SaveConfirmationModal, DeleteConfirmationModal } from './ConfirmationModal';

interface PaymentsProps {
  user: User;
  fuelLogs: FuelLog[];
  dieselBunkAccounts: DieselBunkAccount[];
  onSaveDieselBunkAccount: (account: Omit<DieselBunkAccount, 'id'> & { id?: string }) => Promise<string | undefined>;
  onDeleteDieselBunkAccount: (id: string) => Promise<void>;
  dieselBunkPayments: DieselBunkPayment[];
  onAddDieselBunkPayment: (payment: Omit<DieselBunkPayment, 'id' | 'enteredBy'>) => Promise<void>;
  onDeleteDieselBunkPayment: (id: string) => Promise<void>;
}

const PAYMENT_MODES: { value: DieselBunkPayment['mode']; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'netbanking', label: 'Netbanking' }
];

const MODE_ICON: Record<DieselBunkPayment['mode'], React.ComponentType<{ className?: string }>> = {
  cash: Banknote, card: CreditCard, netbanking: Wallet
};

const MODE_BADGE_CLASS: Record<DieselBunkPayment['mode'], string> = {
  cash: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  card: 'bg-blue-50 text-blue-700 border-blue-200',
  netbanking: 'bg-purple-50 text-purple-700 border-purple-200'
};

// Falls back to this whenever a bunk has no explicit
// DieselBunkAccount.highExposureThreshold of its own (either because it's
// never been configured, or because the bunk has never been explicitly
// registered as an account at all - see BunkRow.account below).
const DEFAULT_HIGH_EXPOSURE_THRESHOLD = 50000;

const bunkKey = (bunkName: string, location: string) => `${location}|||${bunkName}`;

// "<Bunk Name> (<Location>)" - the fixed display format wherever a bunk name
// renders read-only in this module (2026-09-07 direct request), e.g. "Kamala
// (Nelamangala)". Never used for an input/datalist value - those must stay
// the bare bunkName since that's what actually gets saved/matched.
const formatBunkLocation = (bunkName: string, location: string) => `${bunkName} (${location})`;

type StatusLevel = 'High' | 'Pending' | 'Clear';

// One merged row per bunk this module knows about - the union of every
// (bunkName, location) pair that's ever actually been fueled at (from
// fuelLogs) and every pair with its own explicitly-registered
// DieselBunkAccount (e.g. one set up purely to carry in an Opening Balance
// before any purchase has been logged against it yet). A bunk with no
// account row at all just uses the defaults (0 opening balance, the global
// exposure threshold) - registering one is optional, not a prerequisite for
// showing up here the moment Fuel Management logs a fill-up at it.
interface BunkRow {
  key: string;
  bunkName: string;
  location: string;
  account?: DieselBunkAccount;
  openingBalance: number;
  threshold: number;
  purchases: { date: string; amount: number; fuelLog: FuelLog }[];
  payments: DieselBunkPayment[];
  // Fuel Management Card Entries (bunkOrCard 'Card') filled at this bunk +
  // location. A card swipe is fuel bought here AND paid for on the spot, so
  // its amount counts once on each side (in totalPurchases and in
  // totalPayments) and never moves the balance - see cardPayments below.
  cardEntries: FuelLog[];
  cardPayments: number; // consolidated "Card Payments" total of cardEntries
  bunkPurchases: number; // Bunk-paid fuel only (the pre-card total)
  totalPurchases: number; // bunkPurchases + cardPayments
  manualPayments: number; // Diesel Payments logged here (cash/card/netbanking)
  totalPayments: number; // manualPayments + cardPayments
  balance: number; // openingBalance - totalPurchases + totalPayments
  lastPaymentDate?: string;
  status: StatusLevel;
}

const STATUS_BADGE_CLASS: Record<StatusLevel, string> = {
  High: 'bg-rose-50 text-rose-700 border-rose-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Clear: 'bg-emerald-50 text-emerald-700 border-emerald-200'
};

export default function Payments({
  user, fuelLogs, dieselBunkAccounts, onSaveDieselBunkAccount, onDeleteDieselBunkAccount,
  dieselBunkPayments, onAddDieselBunkPayment, onDeleteDieselBunkPayment
}: PaymentsProps) {
  // Entered By (see DieselBunkPayment.enteredBy) is visible only to Super
  // Admins/Principal - department 'super_admin' covers both - NOT Praveen,
  // even though he has module access. Server already strips the field for
  // anyone else (maskAttributionField), this just decides whether to render it.
  const isSuperAdmin = user.department === 'super_admin';

  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const triggerNotif = (message: string, type: 'success' | 'error' = 'success') => { setNotif({ message, type }); setTimeout(() => setNotif(null), 4000); };
  const [saveConfirmation, setSaveConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ label: string; identifier: string; key: number } | null>(null);

  // Which bunk's History (full passbook) is currently open, if any - null
  // means the main Bunk Balance list is showing instead. This app has no
  // URL routing, so "View History" is just an internal view swap, same
  // convention Petty Cash's own "View in Market Trip" deep link uses.
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  // Bunk detail screen's ownership tab (2026-09-23) - see the summary block
  // above the payment history table.
  const [ownershipTab, setOwnershipTab] = useState<'KCM Supply' | 'KCM Insta'>('KCM Supply');

  const [sortMode, setSortMode] = useState<'balance' | 'name'>('balance');

  // Add/Edit Bunk Account modal state.
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accBunkName, setAccBunkName] = useState('');
  const [accLocation, setAccLocation] = useState('');
  const [accOpeningBalance, setAccOpeningBalance] = useState('0');
  const [accThreshold, setAccThreshold] = useState('');
  const [accError, setAccError] = useState('');
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);

  // Add Payment modal state - always opened in the context of one specific
  // bunk (paymentBunkKey), never with a bunk picker of its own (per spec:
  // "Payments are always manual... no period" - and no bunk selector either,
  // since it's always added from inside that bunk's own row/history).
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentBunkKey, setPaymentBunkKey] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<DieselBunkPayment['mode']>('cash');
  const [payReference, setPayReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // "Whatever bunks exist in Fuel Management" - derived straight from actual
  // FuelLog rows (not a separately-maintained list). (Location, Bunk Name)
  // is the real identity - the same bunk name can exist at more than one
  // location (e.g. HPCL at BLR/Chennai/Goa), each its own running account.
  //
  // Bunk-only (2026-09-07 direct request): Diesel Payments tracks running
  // bunk credit accounts, so a Card-paid fuel entry (which can still carry a
  // bunkName/location - it's the pump you filled at, not how you paid) must
  // never make that bunk appear here or count toward its balance. Missing
  // bunkOrCard (legacy rows predating the field) defaults to 'Bunk', same
  // fallback FuelManagement's own ledger already uses.
  const isBunkPaid = (l: FuelLog) => (l.bunkOrCard || 'Bunk') === 'Bunk';

  const fuelBunkOptions = useMemo(() => {
    const map = new Map<string, { bunkName: string; location: string }>();
    fuelLogs.forEach(l => {
      if (!l.bunkName || !l.location || !isBunkPaid(l)) return;
      map.set(bunkKey(l.bunkName, l.location), { bunkName: l.bunkName, location: l.location });
    });
    return Array.from(map.values()).sort((a, b) => a.bunkName.localeCompare(b.bunkName) || a.location.localeCompare(b.location));
  }, [fuelLogs]);

  // Fuel Management -> Card Entries, grouped by the same (Bunk Name,
  // Location) identity as Bunk-paid purchases - exact match, same as the
  // purchase filter below. Read live from fuelLogs, so editing/deleting a
  // Card Entry updates Card Payments immediately; each entry lands in at
  // most one group, so it can never be counted twice.
  const { cardLogsByBunk, cardLogsWithoutBunk } = useMemo(() => {
    const byBunk = new Map<string, FuelLog[]>();
    const withoutBunk: FuelLog[] = [];
    fuelLogs.forEach(l => {
      if (l.bunkOrCard !== 'Card') return;
      if (!l.bunkName || !l.location) { withoutBunk.push(l); return; }
      const key = bunkKey(l.bunkName, l.location);
      const list = byBunk.get(key);
      if (list) list.push(l); else byBunk.set(key, [l]);
    });
    return { cardLogsByBunk: byBunk, cardLogsWithoutBunk: withoutBunk };
  }, [fuelLogs]);

  const bunkRows: BunkRow[] = useMemo(() => {
    const keys = new Map<string, { bunkName: string; location: string }>();
    fuelBunkOptions.forEach(b => keys.set(bunkKey(b.bunkName, b.location), b));
    dieselBunkAccounts.forEach(a => keys.set(bunkKey(a.bunkName, a.location), { bunkName: a.bunkName, location: a.location }));

    return Array.from(keys.entries()).map(([key, { bunkName, location }]) => {
      const account = dieselBunkAccounts.find(a => bunkKey(a.bunkName, a.location) === key);
      const openingBalance = account?.openingBalance || 0;
      const threshold = account?.highExposureThreshold || DEFAULT_HIGH_EXPOSURE_THRESHOLD;
      // Purchases are never stored - always read live from Fuel Management's
      // own fuel entries for this bunk, so editing/deleting one there
      // instantly updates this bunk's balance/history here too.
      const purchases = fuelLogs
        .filter(l => l.bunkName === bunkName && l.location === location && isBunkPaid(l))
        .map(l => ({ date: l.date, amount: l.amount || 0, fuelLog: l }));
      const payments = dieselBunkPayments.filter(p => p.bunkId === (account?.id || key));
      const cardEntries = cardLogsByBunk.get(key) || [];
      const cardPayments = parseFloat(cardEntries.reduce((s, l) => s + (l.amount || 0), 0).toFixed(2));
      const bunkPurchases = purchases.reduce((s, p) => s + p.amount, 0);
      const manualPayments = payments.reduce((s, p) => s + (p.amount || 0), 0);
      const totalPurchases = parseFloat((bunkPurchases + cardPayments).toFixed(2));
      const totalPayments = parseFloat((manualPayments + cardPayments).toFixed(2));
      const balance = parseFloat((openingBalance - totalPurchases + totalPayments).toFixed(2));
      const lastPaymentDate = payments.length > 0 ? payments.reduce((max, p) => p.date > max ? p.date : max, payments[0].date) : undefined;
      const owed = Math.max(0, -balance);
      const status: StatusLevel = balance >= 0 ? 'Clear' : owed >= threshold ? 'High' : 'Pending';
      return { key, bunkName, location, account, openingBalance, threshold, purchases, payments, cardEntries, cardPayments, bunkPurchases, totalPurchases, manualPayments, totalPayments, balance, lastPaymentDate, status };
    });
  }, [fuelBunkOptions, dieselBunkAccounts, fuelLogs, dieselBunkPayments, cardLogsByBunk]);

  // Card Entries that can't be shown under any bunk here, reported instead
  // of guessed: no Bunk Name/Location on the entry at all, or a bunk this
  // module doesn't track (Card never makes a bunk appear on its own - see
  // isBunkPaid above).
  const unassignedCard = useMemo(() => {
    const tracked = new Set(bunkRows.map(r => r.key));
    let noBunkCount = 0, noBunkTotal = 0, untrackedCount = 0, untrackedTotal = 0;
    cardLogsByBunk.forEach((logs, key) => {
      if (tracked.has(key)) return;
      untrackedCount += logs.length;
      untrackedTotal += logs.reduce((s, l) => s + (l.amount || 0), 0);
    });
    cardLogsWithoutBunk.forEach(l => { noBunkCount += 1; noBunkTotal += l.amount || 0; });
    return {
      noBunkCount, noBunkTotal: parseFloat(noBunkTotal.toFixed(2)),
      untrackedCount, untrackedTotal: parseFloat(untrackedTotal.toFixed(2))
    };
  }, [bunkRows, cardLogsByBunk, cardLogsWithoutBunk]);

  const sortedRows = useMemo(() => [...bunkRows].sort((a, b) =>
    sortMode === 'balance' ? (a.balance - b.balance || a.bunkName.localeCompare(b.bunkName)) : (a.bunkName.localeCompare(b.bunkName) || a.location.localeCompare(b.location))
  ), [bunkRows, sortMode]);

  // Dashboard cards - fleet-wide, independent of sort order. Highest
  // Exposure no longer has its own card (2026-09-12) - the same information
  // is now visually called out directly on that bunk's own tile below (see
  // the Bunk Wise Balance tile grid's status-based border/label color).
  const totalOutstanding = bunkRows.reduce((s, r) => s + Math.max(0, -r.balance), 0);

  const historyRow = historyKey ? bunkRows.find(r => r.key === historyKey) : undefined;

  // ------------------------------------------------------------------
  // Add/Edit Bunk Account
  // ------------------------------------------------------------------
  const resetAccountModal = () => {
    setShowAccountModal(false);
    setEditingAccountId(null);
    setAccBunkName('');
    setAccLocation('');
    setAccOpeningBalance('0');
    setAccThreshold('');
    setAccError('');
  };
  const openAddAccount = () => { resetAccountModal(); setShowAccountModal(true); };
  const openEditAccount = (row: BunkRow) => {
    resetAccountModal();
    setEditingAccountId(row.account?.id || null);
    setAccBunkName(row.bunkName);
    setAccLocation(row.location);
    setAccOpeningBalance(String(row.openingBalance));
    setAccThreshold(row.account?.highExposureThreshold != null ? String(row.account.highExposureThreshold) : '');
    setShowAccountModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccError('');
    if (!accBunkName.trim() || !accLocation.trim()) {
      triggerNotif('Bunk Name and Location are required.', 'error');
      return;
    }
    // A brand-new account can't reuse a (Bunk Name, Location) that's already
    // tracked here (whether via an explicit account or just Fuel Management
    // history) - editing an existing account's own row is fine.
    if (!editingAccountId) {
      const conflict = bunkRows.find(r => r.key === bunkKey(accBunkName.trim(), accLocation.trim()));
      if (conflict) {
        setAccError(`${accBunkName.trim()} (${accLocation.trim()}) is already tracked here - edit that row instead of adding a duplicate.`);
        return;
      }
    }
    setIsSubmittingAccount(true);
    try {
      await onSaveDieselBunkAccount({
        id: editingAccountId || undefined,
        bunkName: accBunkName.trim(),
        location: accLocation.trim(),
        openingBalance: parseFloat(accOpeningBalance) || 0,
        highExposureThreshold: accThreshold.trim() ? parseFloat(accThreshold) : undefined
      });
      setSaveConfirmation({ label: editingAccountId ? 'Bunk account' : 'New bunk account', identifier: `${accBunkName.trim()} (${accLocation.trim()})`, key: Date.now() });
      resetAccountModal();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to save bunk account.', 'error');
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleDeleteAccount = async (row: BunkRow) => {
    if (!row.account) {
      triggerNotif('This bunk has no registered account to delete - it\'s only shown here because Fuel Management has fuel entries against it.', 'error');
      return;
    }
    if (!confirm(`Delete the bunk account for ${row.bunkName} (${row.location})? This also removes its ${row.payments.length} logged payment(s). Fuel Management's own fuel entries are untouched. This cannot be undone.`)) return;
    try {
      await onDeleteDieselBunkAccount(row.account.id);
      setDeleteConfirmation({ label: 'Bunk account', identifier: `${row.bunkName} (${row.location})`, key: Date.now() });
      if (historyKey === row.key) setHistoryKey(null);
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete bunk account.', 'error');
    }
  };

  // ------------------------------------------------------------------
  // Add Payment
  // ------------------------------------------------------------------
  const resetPaymentModal = () => {
    setShowPaymentModal(false);
    setPaymentBunkKey('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount('');
    setPayMode('cash');
    setPayReference('');
  };
  const openAddPayment = (row: BunkRow) => {
    resetPaymentModal();
    setPaymentBunkKey(row.key);
    setShowPaymentModal(true);
  };

  const paymentTargetRow = bunkRows.find(r => r.key === paymentBunkKey);
  const referenceRequired = payMode !== 'cash';

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetRow) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      triggerNotif('Enter a valid payment Amount greater than 0.', 'error');
      return;
    }
    if (!payDate) {
      triggerNotif('Pick a Payment Date.', 'error');
      return;
    }
    if (referenceRequired && !payReference.trim()) {
      triggerNotif('Reference/Note is required for Card and Netbanking payments.', 'error');
      return;
    }
    setIsSubmittingPayment(true);
    try {
      // A bunk with no explicit account yet gets one created on the fly
      // (0 opening balance) the first time a payment is logged against it -
      // payments need a real bunkId to attach to, but registering an
      // account was never a prerequisite for showing up on the list.
      let bunkId = paymentTargetRow.account?.id;
      if (!bunkId) {
        bunkId = await onSaveDieselBunkAccount({ bunkName: paymentTargetRow.bunkName, location: paymentTargetRow.location, openingBalance: 0 });
      }
      if (!bunkId) throw new Error('Could not resolve this bunk\'s account.');
      await onAddDieselBunkPayment({ bunkId, date: payDate, amount: amt, mode: payMode, reference: payReference.trim() || undefined });
      setSaveConfirmation({ label: 'Payment', identifier: `${paymentTargetRow.bunkName} (${paymentTargetRow.location}) — ₹${amt.toLocaleString('en-IN')}`, key: Date.now() });
      resetPaymentModal();
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to log payment.', 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleDeletePayment = async (payment: DieselBunkPayment) => {
    if (!confirm(`Delete this ₹${payment.amount.toLocaleString('en-IN')} ${payment.mode} payment logged on ${payment.date}? This cannot be undone.`)) return;
    try {
      await onDeleteDieselBunkPayment(payment.id);
      setDeleteConfirmation({ label: 'Payment', identifier: `₹${payment.amount.toLocaleString('en-IN')} (${PAYMENT_MODES.find(m => m.value === payment.mode)?.label})`, key: Date.now() });
    } catch (err) {
      triggerNotif(err instanceof Error ? err.message : 'Failed to delete payment.', 'error');
    }
  };

  // ------------------------------------------------------------------
  // Bunk History (full passbook) - opening balance row, then every
  // purchase/payment in date order with a running balance. Card Entries are
  // left out on purpose: each one is a purchase and a payment of the same
  // amount, so it nets to zero and every running balance stays exact.
  // ------------------------------------------------------------------
  type PassbookRow = {
    key: string;
    date: string;
    kind: 'opening' | 'purchase' | 'payment';
    purchaseAmount?: number;
    paymentAmount?: number;
    mode?: DieselBunkPayment['mode'];
    reference?: string;
    runningBalance: number;
    raw?: FuelLog | DieselBunkPayment;
  };
  const passbookFor = (row: BunkRow): PassbookRow[] => {
    const events = [
      ...row.purchases.map(p => ({ date: p.date, kind: 'purchase' as const, amount: p.amount, fuelLog: p.fuelLog })),
      ...row.payments.map(p => ({ date: p.date, kind: 'payment' as const, amount: p.amount, payment: p }))
    ].sort((a, b) => a.date === b.date ? (a.kind === b.kind ? 0 : a.kind === 'purchase' ? -1 : 1) : (a.date < b.date ? -1 : 1));

    let running = row.openingBalance;
    const rows: PassbookRow[] = [{ key: 'opening', date: '—', kind: 'opening', runningBalance: running }];
    events.forEach((e, i) => {
      running = e.kind === 'purchase' ? parseFloat((running - e.amount).toFixed(2)) : parseFloat((running + e.amount).toFixed(2));
      if (e.kind === 'purchase') {
        rows.push({
          key: `P:${e.fuelLog.id}`, date: e.date, kind: 'purchase', purchaseAmount: e.amount,
          reference: [e.fuelLog.indentNumber, e.fuelLog.vehicleNumber].filter(Boolean).join(' / ') || undefined,
          runningBalance: running, raw: e.fuelLog
        });
      } else {
        rows.push({
          key: `T:${e.payment.id}`, date: e.date, kind: 'payment', paymentAmount: e.amount, mode: e.payment.mode,
          reference: e.payment.reference, runningBalance: running, raw: e.payment
        });
      }
    });
    return rows;
  };

  return (
    <div className="space-y-6" id="payments-view-wrapper">
      {notif && (
        <div className={`p-3 border rounded-lg text-xs font-semibold ${notif.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {notif.message}
        </div>
      )}

      {/* ================= History (detail passbook) view ================= */}
      {historyRow ? (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <button onClick={() => setHistoryKey(null)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer mb-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Bunk Balances
              </button>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
                <Landmark className="text-emerald-600 w-5 h-5" />
                {historyRow.bunkName} <span className="text-slate-400 font-normal text-base">({historyRow.location})</span>
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Diesel Payment history only - Opening Balance, then every payment made against this bunk, oldest first, with the balance left after each one.
                Fuel purchases still count toward that balance but aren't listed as rows here - see Fuel Management for individual fuel entries.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[9px] text-slate-400 uppercase font-bold">Current Balance</p>
                <p className={`text-lg font-black font-mono ${historyRow.balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {historyRow.balance < 0 ? '-' : ''}₹{Math.abs(historyRow.balance).toLocaleString('en-IN')}
                </p>
              </div>
              <button
                onClick={() => openAddPayment(historyRow)}
                className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:shadow-md text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Add Payment
              </button>
            </div>
          </div>

          {/* Balance breakdown - Card Payments is ONE consolidated figure
              (every Fuel Management Card Entry at this bunk + location),
              never one row per card transaction. Card fuel is counted in
              Fuel Purchases too, so Closing Balance is unchanged by it. */}
          {(() => {
            const sumMode = (modes: DieselBunkPayment['mode'][]) => historyRow.payments.filter(p => modes.includes(p.mode)).reduce((s, p) => s + (p.amount || 0), 0);
            const lines: { label: string; hint?: string; amount: number; sign: '' | '-' | '+'; strong?: boolean }[] = [
              { label: 'Opening Balance', amount: historyRow.openingBalance, sign: '' },
              { label: 'Fuel Purchases', hint: historyRow.cardPayments > 0 ? 'incl. card-paid fuel' : undefined, amount: historyRow.totalPurchases, sign: '-' },
              { label: 'Cash Payments', amount: sumMode(['cash']), sign: '+' },
              { label: 'Card Payments', hint: `${historyRow.cardEntries.length} Fuel Management card ${historyRow.cardEntries.length === 1 ? 'entry' : 'entries'}`, amount: historyRow.cardPayments, sign: '+' },
              { label: 'Other Payments', hint: 'Card / Netbanking logged here', amount: sumMode(['card', 'netbanking']), sign: '+' }
            ];
            return (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                  {lines.map(l => (
                    <div key={l.label}>
                      <p className="text-[9px] text-slate-400 uppercase font-bold flex items-center gap-1">
                        {l.label === 'Card Payments' && <CreditCard className="w-3 h-3 text-blue-600" />}{l.label}
                      </p>
                      <p className={`text-base font-black font-mono ${l.sign === '-' ? 'text-rose-600' : l.sign === '+' ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {l.sign === '-' && l.amount > 0 ? '-' : l.amount < 0 ? '-' : ''}₹{Math.abs(l.amount).toLocaleString('en-IN')}
                      </p>
                      {l.hint && <p className="text-[9px] text-slate-400 font-mono">{l.hint}</p>}
                    </div>
                  ))}
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Closing Balance</p>
                    <p className={`text-base font-black font-mono ${historyRow.balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {historyRow.balance < 0 ? '-' : ''}₹{Math.abs(historyRow.balance).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* KCM Supply / KCM Insta diesel purchase split (2026-09-23 direct
              request) - summary only. Built from this bunk's own
              historyRow.purchases, i.e. the same live Fuel Management
              entries (this bunk + location, Bunk-paid) the balance above
              already uses, grouped by each entry's Type - never a copied
              dataset. Purchase totals only: payments aren't tagged by
              ownership, so there's no per-ownership balance. */}
          {(() => {
            const byType = (t: string) => historyRow.purchases.filter(p => p.fuelLog.type === t);
            const tabPurchases = byType(ownershipTab);
            const tabTotal = tabPurchases.reduce((s, p) => s + p.amount, 0);
            const vehicleCount = new Set(tabPurchases.map(p => (p.fuelLog.vehicleNumber || '').trim().toUpperCase()).filter(Boolean)).size;
            const vendorTotal = byType('Vendor').reduce((s, p) => s + p.amount, 0);
            const legacyTotal = byType('KCM').reduce((s, p) => s + p.amount, 0);
            return (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold w-fit">
                  {(['KCM Supply', 'KCM Insta'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setOwnershipTab(tab)}
                      className={`px-3.5 py-1.5 rounded-md cursor-pointer transition-colors ${ownershipTab === tab ? 'bg-white shadow-xs text-emerald-700' : 'text-slate-500'}`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">{ownershipTab} diesel purchases</p>
                    <p className="text-lg font-black font-mono text-slate-900">₹{tabTotal.toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Fuel entries</p>
                    <p className="text-lg font-black font-mono text-slate-700">{tabPurchases.length}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-400 uppercase font-bold">Vehicles</p>
                    <p className="text-lg font-black font-mono text-slate-700">{vehicleCount}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Purchase totals by fuel entry Type (see Fuel Management for individual entries) - not a split of the balance, since payments aren't tagged by ownership.
                  {(vendorTotal > 0 || legacyTotal > 0) && (
                    <> Not in either tab: {vendorTotal > 0 && <>Vendor ₹{vendorTotal.toLocaleString('en-IN')}</>}{vendorTotal > 0 && legacyTotal > 0 && ' · '}{legacyTotal > 0 && <>older "KCM" entries (before the Supply/Insta split) ₹{legacyTotal.toLocaleString('en-IN')}</>}.</>
                  )}
                </p>
              </div>
            );
          })()}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                  <tr>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Mode</th>
                    <th className="px-3 py-2.5 text-right">Payment Amount</th>
                    <th className="px-3 py-2.5 text-right">Balance After Payment</th>
                    <th className="px-3 py-2.5">Payment Reference</th>
                    {isSuperAdmin && <th className="px-3 py-2.5">Entered By</th>}
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {/* Diesel Payment records only - fuel purchases from Fuel
                      Management still feed into runningBalance (so "Balance
                      After Payment" is always the true balance at that
                      point), they just aren't rendered as their own rows
                      here. See Fuel Management for individual fuel entries. */}
                  {passbookFor(historyRow).filter(row => row.kind !== 'purchase').map(row => (
                    <tr key={row.key} className={row.kind === 'opening' ? 'bg-slate-50/70' : 'hover:bg-slate-50/60 transition-colors'}>
                      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{row.date}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.kind === 'opening' ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border bg-slate-100 text-slate-600 border-slate-300">Opening Balance</span>
                        ) : row.mode ? (() => { const Icon = MODE_ICON[row.mode!]; return (
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border inline-flex items-center gap-1 ${MODE_BADGE_CLASS[row.mode!]}`}>
                            <Icon className="w-3 h-3" /> {PAYMENT_MODES.find(m => m.value === row.mode)?.label}
                          </span>
                        ); })() : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">{row.paymentAmount != null ? `₹${row.paymentAmount.toLocaleString('en-IN')}` : <span className="text-slate-300">-</span>}</td>
                      <td className={`px-3 py-2 text-right font-mono font-black whitespace-nowrap ${row.runningBalance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {row.runningBalance < 0 ? '-' : ''}₹{Math.abs(row.runningBalance).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate" title={row.reference}>{row.reference || <span className="text-slate-300">-</span>}</td>
                      {isSuperAdmin && (
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                          {row.kind === 'payment' ? (row.raw as DieselBunkPayment).enteredBy || '-' : '-'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        {row.kind === 'payment' && (
                          <button onClick={() => handleDeletePayment(row.raw as DieselBunkPayment)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete this payment">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ================= Main: Bunk Balance list ================= */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
                <Landmark className="text-emerald-600 w-5 h-5" />
                Diesel Payments
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                One continuous running account per fuel bunk - balance only ever moves on a purchase or a payment, never resets on a period boundary.
              </p>
            </div>
            <button
              onClick={openAddAccount}
              className="mt-3 md:mt-0 bg-gradient-to-r from-emerald-600 to-teal-700 hover:shadow-md text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap w-fit"
            >
              <Plus className="w-4 h-4" /> Add Bunk Account
            </button>
          </div>

          {/* Total Outstanding - kept as its own KPI card, unchanged. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs">
              <p className="font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5" /> Total Outstanding</p>
              <h3 className="text-xl font-black text-rose-700 mt-1">₹{totalOutstanding.toLocaleString('en-IN')}</h3>
              <p className="text-slate-400 mt-0.5">Owed across every tracked bunk</p>
            </div>
          </div>

          {/* Bunk Wise Balance - one tile per bunk (2026-09-12), styled like
              the fleet-status KPI cards, replacing the old scrolling list +
              separate Highest Exposure card so every bunk is visible at once
              without switching tabs. The bunk list itself is never hardcoded
              - it's the same live-derived `sortedRows` the table below
              already uses (every bunk Fuel Management or an explicit
              DieselBunkAccount knows about), so a brand new bunk shows up
              here automatically with zero code changes. Tiles inherit
              whatever ordering the Sort dropdown below is set to (defaults
              to most-owed-first) rather than a second, separate sort
              control. Border/label color reuses each bunk's own already-
              computed exposure Status (High/Pending/Clear - see
              STATUS_BADGE_CLASS and each row's own `threshold`), so a bunk
              above its configured exposure threshold is visually called out
              in red the same way "Unresolved Alerts" is on the Fleet
              dashboard - clicking a tile opens that bunk's own History. */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Bunk Wise Balance</p>
            {sortedRows.length === 0 ? (
              <p className="text-slate-400 text-xs bg-white border border-slate-200 rounded-xl p-4 text-center">No bunks tracked yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 text-xs">
                {sortedRows.map(row => {
                  const tileBorderClass = row.status === 'High' ? 'border-rose-300 bg-rose-50/40' : row.status === 'Pending' ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/20';
                  const labelColorClass = row.status === 'High' ? 'text-rose-600' : row.status === 'Pending' ? 'text-amber-600' : 'text-emerald-600';
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setHistoryKey(row.key)}
                      title={`View ${formatBunkLocation(row.bunkName, row.location)} history`}
                      className={`text-left p-4 rounded-xl border shadow-xs hover:shadow-md transition-all cursor-pointer ${tileBorderClass}`}
                    >
                      <p className={`font-bold uppercase tracking-wider text-[10px] truncate ${labelColorClass}`}>{formatBunkLocation(row.bunkName, row.location)}</p>
                      <h3 className={`text-lg font-black mt-1 whitespace-nowrap ${row.balance < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {row.balance < 0 ? '-' : ''}₹{Math.abs(row.balance).toLocaleString('en-IN')}
                      </h3>
                      {row.cardPayments > 0 && (
                        <p className="text-[10px] text-blue-700 font-bold mt-1 flex items-center gap-1 whitespace-nowrap">
                          <CreditCard className="w-3 h-3" /> Card Payments ₹{row.cardPayments.toLocaleString('en-IN')}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {(unassignedCard.noBunkCount > 0 || unassignedCard.untrackedCount > 0) && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 font-mono">
                Card Entries not shown under any bunk:
                {unassignedCard.noBunkCount > 0 && <> {unassignedCard.noBunkCount} with no Bunk Name/Location (₹{unassignedCard.noBunkTotal.toLocaleString('en-IN')})</>}
                {unassignedCard.noBunkCount > 0 && unassignedCard.untrackedCount > 0 && ' ·'}
                {unassignedCard.untrackedCount > 0 && <> {unassignedCard.untrackedCount} at bunks with no Bunk-paid fuel or bunk account here (₹{unassignedCard.untrackedTotal.toLocaleString('en-IN')})</>}
                . See Fuel Management → Card Entries.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-end gap-2 p-3 border-b border-slate-100 text-xs">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as 'balance' | 'name')}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700"
              >
                <option value="balance">Sort: Most Owed First</option>
                <option value="name">Sort: Bunk Name</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px]">
                  <tr>
                    <th className="px-3 py-2.5">Bunk Name</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-3 py-2.5 text-right">Total Fuel Amount</th>
                    <th className="px-3 py-2.5 text-right">Card Payments</th>
                    <th className="px-3 py-2.5 text-right">Total Payments Made</th>
                    <th className="px-3 py-2.5 text-right">Current Balance</th>
                    <th className="px-3 py-2.5">Last Payment Date</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-3 py-2.5 text-center">Add Payment</th>
                    <th className="px-3 py-2.5 text-center">View History</th>
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-12 text-slate-400 font-mono">NO BUNKS TRACKED YET.</td></tr>
                  ) : sortedRows.map(row => (
                    <tr key={row.key} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5 font-bold text-slate-900 whitespace-nowrap">{row.bunkName}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{row.location}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600 whitespace-nowrap">₹{row.totalPurchases.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-blue-700 whitespace-nowrap">{row.cardPayments > 0 ? `₹${row.cardPayments.toLocaleString('en-IN')}` : <span className="text-slate-300">-</span>}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600 whitespace-nowrap">₹{row.totalPayments.toLocaleString('en-IN')}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-black whitespace-nowrap ${row.balance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {row.balance < 0 ? '-' : ''}₹{Math.abs(row.balance).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 whitespace-nowrap">{row.lastPaymentDate || <span className="text-slate-300">-</span>}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${STATUS_BADGE_CLASS[row.status]}`}>{row.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => openAddPayment(row)}
                          className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Payment
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => setHistoryKey(row.key)}
                          className="text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Wallet2 className="w-3 h-3" /> History
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <button onClick={() => openEditAccount(row)} className="p-1 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded cursor-pointer" title="Edit Opening Balance / Exposure Threshold">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteAccount(row)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded cursor-pointer" title="Delete bunk account">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Bunk Account modal - Opening Balance + High-Exposure
          Threshold only; no period fields at all (a running account has no
          billing cycle). */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-400" />
                {editingAccountId ? 'Edit Bunk Account' : 'Add Bunk Account'}
              </h3>
              <button onClick={resetAccountModal} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveAccount} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Bunk Name *</label>
                  <input
                    required
                    disabled={!!editingAccountId}
                    list="payments-bunk-name-datalist"
                    value={accBunkName}
                    onChange={(e) => setAccBunkName(e.target.value)}
                    autoComplete="off"
                    className={`w-full border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800 ${editingAccountId ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50'}`}
                  />
                  <datalist id="payments-bunk-name-datalist">{Array.from(new Set(fuelBunkOptions.map(b => b.bunkName))).map(n => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Location *</label>
                  <input
                    required
                    disabled={!!editingAccountId}
                    list="payments-bunk-location-datalist"
                    value={accLocation}
                    onChange={(e) => setAccLocation(e.target.value)}
                    autoComplete="off"
                    className={`w-full border border-slate-200 rounded-lg p-2 text-slate-800 ${editingAccountId ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50'}`}
                  />
                  <datalist id="payments-bunk-location-datalist">{Array.from(new Set(fuelBunkOptions.map(b => b.location))).map(l => <option key={l} value={l} />)}</datalist>
                </div>
              </div>
              {!editingAccountId && <p className="text-[9px] text-slate-400 font-mono">Match Fuel Management's own Bunk Name/Location spelling exactly so its fuel entries link up as purchases here. A bunk not yet fueled at can still be added, e.g. to carry in an Opening Balance.</p>}
              {accError && <p className="text-[10px] text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{accError}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Opening Balance</label>
                  <input type="number" step="0.01" value={accOpeningBalance} onChange={(e) => setAccOpeningBalance(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800" />
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">Negative = already owed to this bunk before tracking started. 0 for a fresh account.</p>
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">High-Exposure Threshold</label>
                  <input type="number" step="0.01" min="0" placeholder={`Default ₹${DEFAULT_HIGH_EXPOSURE_THRESHOLD.toLocaleString('en-IN')}`} value={accThreshold} onChange={(e) => setAccThreshold(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">₹ owed at which this bunk's badge turns "High". Leave blank to use the default.</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetAccountModal} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
                <button type="submit" disabled={isSubmittingAccount} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold rounded-xl py-2.5 hover:shadow-md uppercase text-[10px] cursor-pointer">
                  {isSubmittingAccount ? 'Saving...' : editingAccountId ? 'Save Changes' : 'Add Bunk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment modal - Payment Date, Amount, Payment Mode, Reference/
          Note only. No Bunk field (contextual to whichever row/history this
          was opened from) and no period fields at all. */}
      {showPaymentModal && paymentTargetRow && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-emerald-950 text-white flex items-center justify-between sticky top-0 z-10">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-400" />
                Add Payment - {paymentTargetRow.bunkName} ({paymentTargetRow.location})
              </h3>
              <button onClick={resetPaymentModal} className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSavePayment} className="p-5 space-y-3 text-xs">
              <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-100 flex items-center justify-between font-mono">
                <span className="text-[9px] text-rose-600 uppercase font-bold">Current Balance</span>
                <span className="text-sm font-black text-rose-700">{paymentTargetRow.balance < 0 ? '-' : ''}₹{Math.abs(paymentTargetRow.balance).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Payment Date *</label>
                <DateInput required value={payDate} onChange={(e) => setPayDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Amount *</label>
                <input
                  type="number" step="0.01" min="0.01" required
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="₹ Amount"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-800"
                />
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">No cap against the outstanding balance - overpayment is allowed.</p>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Payment Mode *</label>
                <select value={payMode} onChange={(e) => setPayMode(e.target.value as DieselBunkPayment['mode'])} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-bold text-slate-800">
                  {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  Reference / Note {referenceRequired && <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="text" required={referenceRequired}
                  value={payReference} onChange={(e) => setPayReference(e.target.value)}
                  placeholder={referenceRequired ? 'Transaction ID (required)' : 'Optional note'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                />
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                  {referenceRequired ? 'Mandatory for Card/Netbanking - needed to reconcile the transaction later.' : 'Optional for Cash.'}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={resetPaymentModal} className="flex-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-2.5 hover:bg-slate-100 uppercase text-[10px] cursor-pointer">Cancel</button>
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
