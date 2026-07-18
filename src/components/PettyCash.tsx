import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PettyCashVoucher, VehicleDocument } from '../types';
import {
  Landmark,
  Plus,
  Search,
  CheckCircle2,
  Calendar,
  Download,
  Upload,
  Share2,
  Filter,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  Info,
  ChevronRight,
  Clipboard,
  Check,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Paperclip,
  RefreshCw,
  X
} from 'lucide-react';
import DocumentAttachment from './DocumentAttachment';

interface PettyCashProps {
  vouchers: PettyCashVoucher[];
  onAddVoucher: (voucher: Omit<PettyCashVoucher, 'id'>) => Promise<void>;
  onUpdateVoucher: (id: string, voucher: Partial<PettyCashVoucher>) => Promise<void>;
  onDeleteVoucher: (id: string) => Promise<void>;
  onClearImportedPettyCash?: () => Promise<void>;
}

const EXPENSE_CATEGORIES = [
  "ACCIDENT AND SETTELMENT",
  "BANK CHARGES",
  "BATTA EXPENSES",
  "CNG GAS EXPENSES",
  "DEF OIL",
  "DIESEL EXPENSES",
  "DRIVER ROOM RENT",
  "DRIVER SALARY",
  "DRIVER SALARY ADV",
  "DRIVER SALARY PAYABLE",
  "ELECTRICITY CHARGES",
  "LOADING AND UNLOADING EXPENSE",
  "MISC EXPENSES",
  "NP SP FC TAX RENEWALS",
  "OFFICE MAINTENANCE",
  "OTHER EXPENSES",
  "PARKING EXPENSES",
  "POLICE EXPENSES",
  "POOJA EXPENSES",
  "PRINTING & STATIONERY",
  "STAFF WELFARE EXPENSES",
  "TOLL CHARGES",
  "TRAVELLING EXPENSES",
  "VEHICLE HIRE EXPENSES-ADHOC",
  "VEHICLE REGISTERATION EXPS",
  "VENDOR ADVANCE",
  "Grand Total",
  "PAID FROM",
  "RATIO"
];

const CLIENT_NAMES = ["swiggy", "RIL F&V", "market load", "Other"];
const VENDORS = ["kcm insta", "kcm supply"];

export default function PettyCash({ 
  vouchers, 
  onAddVoucher,
  onUpdateVoucher,
  onDeleteVoucher,
  onClearImportedPettyCash
}: PettyCashProps) {
  const [activeTab, setActiveTab] = useState<'ledger' | 'summary'>('ledger');
  const cancelImportRef = useRef(false);
  const [notif, setNotif] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Fullscreen and collapsible states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const summaryFileInputRef = useRef<HTMLInputElement>(null);

  // Import loading & progress states
  const [isImportingSummary, setIsImportingSummary] = useState(false);
  const [isImportingLedger, setIsImportingLedger] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState('All');
  
  // Date range filter for staff to access historical data
  const [filterYear, setFilterYear] = useState('2026');
  const [filterMonth, setFilterMonth] = useState('All'); // All, 01, 02... 12

  // Summary Report year state
  const [summaryYear, setSummaryYear] = useState('2026');

  // Form State
  const [date, setDate] = useState('2026-07-09');
  const [entryNo, setEntryNo] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [location, setLocation] = useState('');
  const [clientName, setClientName] = useState('swiggy');
  const [customClientName, setCustomClientName] = useState('');
  const [vendor, setVendor] = useState<PettyCashVoucher['vendor']>('kcm supply');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [receiver, setReceiver] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [cashPaid, setCashPaid] = useState('');
  const [balance, setBalance] = useState('');
  const [tripSheet, setTripSheet] = useState('');
  const [remarks, setRemarks] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedCellFilter, setSelectedCellFilter] = useState<{ category: string; month: string; vendor?: 'kcm insta' | 'kcm supply' | 'all' } | null>(null);

  // Document management states for Petty Cash entries
  const [selectedVoucherForDocs, setSelectedVoucherForDocs] = useState<PettyCashVoucher | null>(null);

  const handleOpenDocModal = (v: PettyCashVoucher) => {
    setSelectedVoucherForDocs(v);
  };

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Auto calculate balance from amountReceived and cashPaid
  useEffect(() => {
    const r = parseFloat(amountReceived) || 0;
    const p = parseFloat(cashPaid) || 0;
    setBalance(String(r - p));
  }, [amountReceived, cashPaid]);

  // Handle clicking outside of category dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerNotif = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotif({ message, type });
    setTimeout(() => setNotif(null), 4000);
  };

  const handleStartEdit = (v: PettyCashVoucher) => {
    setActiveTab('ledger');
    setEditingId(v.id);
    setDate(v.date);
    setEntryNo(v.entryNo);
    setCategoryInput(v.category);
    setLocation(v.location);
    if (CLIENT_NAMES.includes(v.clientName)) {
      setClientName(v.clientName);
      setCustomClientName('');
    } else {
      setClientName('Other');
      setCustomClientName(v.clientName);
    }
    setVendor(v.vendor);
    setVehicleNumber(v.vehicleNumber);
    setReceiver(v.receiver);
    setVendorId(v.vendorId);
    setAmountReceived(v.amountReceived ? String(v.amountReceived) : '');
    setCashPaid(v.cashPaid ? String(v.cashPaid) : '');
    setBalance(v.balance ? String(v.balance) : '');
    setTripSheet(v.tripSheet);
    setRemarks(v.remarks);
    setShowForm(true); // make sure the sidebar is open!
    
    // Scroll to form smoothly
    const formEl = document.getElementById('petty-cash-form-container');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEntryNo('');
    setCategoryInput('');
    setLocation('');
    setVehicleNumber('');
    setReceiver('');
    setVendorId('');
    setAmountReceived('');
    setCashPaid('');
    setBalance('');
    setTripSheet('');
    setRemarks('');
    setCustomClientName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !entryNo || !categoryInput || !receiver) {
      triggerNotif('Please fill in Date, Entry Number, Category, and Receiver.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalClient = clientName === 'Other' ? customClientName || 'Other' : clientName;
      const voucherData = {
        date,
        entryNo: entryNo.toUpperCase().trim(),
        category: categoryInput.trim(),
        location: location.trim(),
        clientName: finalClient,
        vendor,
        vehicleNumber: vehicleNumber.toUpperCase().trim(),
        receiver: receiver.trim(),
        vendorId: vendorId.trim(),
        amountReceived: parseFloat(amountReceived) || 0,
        cashPaid: parseFloat(cashPaid) || 0,
        balance: parseFloat(balance) || 0,
        tripSheet: tripSheet.trim(),
        remarks: remarks.trim()
      };

      if (editingId) {
        await onUpdateVoucher(editingId, voucherData);
        setEditingId(null);
        triggerNotif('💸 Petty cash voucher successfully updated and synced with Cloud DB!', 'success');
      } else {
        await onAddVoucher(voucherData);
        triggerNotif('💸 Petty cash voucher successfully logged and synced with Cloud DB!', 'success');
      }

      // Clear form (except date & vendor)
      setEntryNo('');
      setCategoryInput('');
      setLocation('');
      setVehicleNumber('');
      setReceiver('');
      setVendorId('');
      setAmountReceived('');
      setCashPaid('');
      setBalance('');
      setTripSheet('');
      setRemarks('');
      setCustomClientName('');
    } catch (err) {
      console.error(err);
      triggerNotif('Failed to write voucher to ledger.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getYearFromDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // Extract only a 4-digit year (1900-2100)
    const match = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
    if (match) return match[1];
    return '';
  };

  const getMonthFromDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return parts[1].padStart(2, '0');
      if (parts[2].length === 4) return parts[1].padStart(2, '0');
    }
    return '';
  };

  // Filter vouchers based on search, vendor, category, year and month
  const filteredVouchers = vouchers.filter(v => {
    // Search Term matching (EntryNo, Category, Location, Receiver, VehicleNumber, ClientName)
    const matchesSearch =
      (v.entryNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.receiver || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.vehicleNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesVendor = selectedVendorFilter === 'All' || v.vendor === selectedVendorFilter;
    const matchesCategory = selectedCategoryFilter === 'All' || v.category === selectedCategoryFilter;

    // Date filtering (Date structure is YYYY-MM-DD or DD-MM-YYYY)
    if (!v.date) return false;
    const year = getYearFromDate(v.date);
    const month = getMonthFromDate(v.date);
    const matchesYear = filterYear === 'All' || year === filterYear;
    const matchesMonth = filterMonth === 'All' || month === filterMonth;

    return matchesSearch && matchesVendor && matchesCategory && matchesYear && matchesMonth;
  });

  // Unique years list from existing vouchers to populate filter
  const availableYears = Array.from(new Set(vouchers.map(v => getYearFromDate(v.date)))).filter(Boolean).sort().reverse();
  const currentYears = availableYears.includes('2026') ? availableYears : ['2026', ...availableYears];

  // List of Month labels
  const MONTHS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  // Helper to convert category suggestions
  const suggestedCategories = EXPENSE_CATEGORIES.filter(cat =>
    cat.toLowerCase().includes(categoryInput.toLowerCase())
  );

  // Robust CSV Line parser that correctly handles double quotes and consecutive commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  // CSV Import function
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const lines = text.split('\n');
        if (lines.length < 2) {
          triggerNotif('CSV file is empty or formatted incorrectly.', 'error');
          return;
        }

        // Parse CSV Rows
        let headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
        
        const itemsToImport: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = parseCSVLine(line);

          const getVal = (field: string, defaultValue = '') => {
            const idx = headers.indexOf(field.toLowerCase());
            if (idx !== -1 && values[idx] !== undefined) return values[idx];
            return defaultValue;
          };

          // Map CSV attributes
          const rDate = getVal('date', new Date().toISOString().split('T')[0]);
          const rEntryNo = getVal('entryno') || getVal('entry number') || getVal('entry_number') || `ENT-IMP-${Date.now()}-${i}`;
          const rCategory = getVal('category') || getVal('expense category') || 'MISC EXPENSES';
          const rLocation = getVal('location') || 'Office';
          const rClientName = getVal('clientname') || getVal('client name') || 'swiggy';
          const rVendor = (getVal('vendor') || 'kcm supply').toLowerCase().includes('insta') ? 'kcm insta' : 'kcm supply';
          const rVehicleNo = getVal('vehiclenumber') || getVal('vehicle number') || getVal('vehicle_number') || '';
          const rReceiver = getVal('receiver') || getVal('recipient') || 'Staff';
          const rVendorId = getVal('vendorid') || getVal('vendor id') || '';
          const rAmtRec = parseFloat(getVal('amountreceived') || getVal('amount received') || '0') || 0;
          const rPaid = parseFloat(getVal('cashpaid') || getVal('cash paid') || '0') || 0;
          const rBal = parseFloat(getVal('balance') || '0') || (rAmtRec - rPaid);
          const rTrip = getVal('tripsheet') || getVal('trip sheet') || '';
          const rRemarks = getVal('remarks') || '';

          itemsToImport.push({
            date: rDate,
            entryNo: rEntryNo.toUpperCase(),
            category: rCategory,
            location: rLocation,
            clientName: rClientName,
            vendor: rVendor,
            vehicleNumber: rVehicleNo.toUpperCase(),
            receiver: rReceiver,
            vendorId: rVendorId,
            amountReceived: rAmtRec,
            cashPaid: rPaid,
            balance: rBal,
            tripSheet: rTrip,
            remarks: rRemarks,
            isImported: true
          });
        }

        if (itemsToImport.length === 0) {
          triggerNotif('No entries found in CSV to import.', 'info');
          return;
        }

        setIsImportingLedger(true);
        cancelImportRef.current = false;
        setImportProgress({ current: 0, total: itemsToImport.length });

        let importCount = 0;
        let failCount = 0;

        for (let idx = 0; idx < itemsToImport.length; idx++) {
          if (cancelImportRef.current) {
            triggerNotif(`Import stopped. Loaded ${importCount} entries.`, 'info');
            break;
          }
          try {
            await onAddVoucher(itemsToImport[idx]);
            importCount++;
          } catch (err) {
            failCount++;
          }
          setImportProgress(prev => ({ ...prev, current: idx + 1 }));
        }

        setIsImportingLedger(false);
        triggerNotif(`Imported ${importCount} vouchers successfully! ${failCount > 0 ? `${failCount} errors.` : ''}`, 'success');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error(err);
        setIsImportingLedger(false);
        triggerNotif('Failed to parse CSV file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  // CSV Import function for consolidated summary matrix
  const handleSummaryCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const lines = text.split('\n');
        if (lines.length < 2) {
          triggerNotif('CSV file is empty or formatted incorrectly.', 'error');
          return;
        }

        // Find the line containing the actual header (starts with "expense category" or "category")
        let headerLineIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes('expense category') || lines[i].toLowerCase().includes('category')) {
            headerLineIdx = i;
            break;
          }
        }

        if (headerLineIdx === -1) {
          triggerNotif('Could not find Expense Category header in CSV. Please ensure it is a valid KCM Summary Report.', 'error');
          return;
        }

        const headers = parseCSVLine(lines[headerLineIdx]);
        
        const itemsToImport: any[] = [];

        // Process data rows starting after the header line
        for (let i = headerLineIdx + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = parseCSVLine(line);

          const category = values[0];
          if (!category || category.toLowerCase() === 'grand totals' || category.toUpperCase().includes('TOTAL')) {
            continue; // Skip totals or empty rows
          }

          // Loop through each column of headers to find month data
          for (let colIdx = 1; colIdx < headers.length; colIdx++) {
            const header = headers[colIdx];
            const valStr = values[colIdx];
            if (!header || !valStr) continue;

            const val = parseFloat(valStr) || 0;
            if (val <= 0) continue; // Skip zero/negative values

            // Header format example: "January (kcm insta)" or "January (kcm supply)" or "January (Total)"
            // Skip (Total) column because we don't want to double count
            if (header.toLowerCase().includes('(total)')) {
              continue;
            }

            // Extract month name and vendor name from header
            const match = header.match(/^"?([^(\n"]+)\s*\(([^)]+)\)"?$/);
            if (!match) continue;

            const monthLabel = match[1].trim();
            const vendorStr = match[2].trim().toLowerCase();

            // Find month index
            const foundMonth = MONTHS.find(m => m.label.toLowerCase() === monthLabel.toLowerCase());
            if (!foundMonth) continue;

            const finalVendor = vendorStr.includes('insta') ? 'kcm insta' : 'kcm supply';

            // Generate an entry number for the imported summary row
            const entryNoSuffix = category.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X');
            const rEntryNo = `SUM-${summaryYear}-${foundMonth.value}-${entryNoSuffix}`;

            itemsToImport.push({
              date: `${summaryYear}-${foundMonth.value}-15`, // Mid-month date
              entryNo: rEntryNo,
              category: category,
              location: 'Consolidated Import',
              clientName: 'swiggy', // Default client
              vendor: finalVendor,
              vehicleNumber: 'CONSOLIDATED',
              receiver: 'HQ FINANCE',
              vendorId: 'AUTO-SUM',
              amountReceived: 0,
              cashPaid: val,
              balance: -val,
              tripSheet: `AUTO-SUM-${summaryYear}`,
              remarks: `Consolidated import for ${category} (${monthLabel} ${summaryYear})`,
              isImported: true
            });
          }
        }

        if (itemsToImport.length === 0) {
          triggerNotif('No valid non-zero consolidated records found in the CSV to import.', 'info');
          return;
        }

        setIsImportingSummary(true);
        cancelImportRef.current = false;
        setImportProgress({ current: 0, total: itemsToImport.length });

        let importCount = 0;
        let failCount = 0;

        for (let idx = 0; idx < itemsToImport.length; idx++) {
          if (cancelImportRef.current) {
            triggerNotif(`Import stopped. Loaded ${importCount} consolidated entries.`, 'info');
            break;
          }
          try { 
            await onAddVoucher(itemsToImport[idx]);
            importCount++;
          } catch (err) {
            failCount++;
          }
          setImportProgress(prev => ({ ...prev, current: idx + 1 }));
        }

        setIsImportingSummary(false);
        triggerNotif(`Successfully imported ${importCount} consolidated monthly summary records as active cash ledger vouchers! ${failCount > 0 ? `${failCount} errors.` : ''}`, 'success');
        if (summaryFileInputRef.current) summaryFileInputRef.current.value = '';
      } catch (err) {
        console.error(err);
        setIsImportingSummary(false);
        triggerNotif('Failed to parse Consolidated Summary CSV.', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Excel Export function for filtered ledger data
  const handleCSVExport = () => {
    if (filteredVouchers.length === 0) {
      triggerNotif('No data available to export.', 'info');
      return;
    }

    const data = filteredVouchers.map(v => ({
      'Date': v.date,
      'Entry No': v.entryNo,
      'Category': v.category,
      'Location': v.location,
      'Client Name': v.clientName,
      'Vendor': v.vendor,
      'Vehicle Number': v.vehicleNumber,
      'Receiver': v.receiver,
      'Vendor ID': v.vendorId,
      'Amount Received': v.amountReceived,
      'Cash Paid': v.cashPaid,
      'Balance': v.balance,
      'Trip Sheet': v.tripSheet,
      'Remarks': v.remarks
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Petty Cash Ledger");
    XLSX.writeFile(workbook, `KCM_Petty_Cash_Ledger_${filterYear}_${filterMonth}.xlsx`);
    triggerNotif('Ledger Excel exported and downloaded successfully!', 'success');
  };

  // Share text builder
  const handleShareLedger = () => {
    const totalRec = filteredVouchers.reduce((s, v) => s + (v.amountReceived || 0), 0);
    const totalPaid = filteredVouchers.reduce((s, v) => s + (v.cashPaid || 0), 0);
    const totalBal = totalRec - totalPaid;

    const summaryText = `*KCM LOGISTICS - PETTY CASH VOUCHERS REPORT*
Date Filter: Year ${filterYear} / Month ${filterMonth === 'All' ? 'All Months' : MONTHS.find(m=>m.value===filterMonth)?.label}
Total Records Checked: ${filteredVouchers.length}
----------------------------------------
- Total Amount Received: ₹${totalRec.toLocaleString('en-IN')}
- Total Cash Paid: ₹${totalPaid.toLocaleString('en-IN')}
- Current Net Balance: ₹${totalBal.toLocaleString('en-IN')}
----------------------------------------
Top Expenditures logged on remote server.
Shared securely on ${new Date().toLocaleDateString('en-IN')}`;

    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      triggerNotif('Summary report text copied to clipboard!', 'success');
    }).catch(err => {
      console.error(err);
      setShowShareModal(true);
    });
  };

  // --- Summary Section Dynamic calculations ---
  // Returns matrix of Category vs Months for the selected summaryYear
  const generateSummaryReport = () => {
    const reportData: {
      category: string;
      months: Record<string, { kcmInsta: number; kcmSupply: number; total: number }>;
    }[] = EXPENSE_CATEGORIES.map(cat => {
      const monthData: Record<string, { kcmInsta: number; kcmSupply: number; total: number }> = {};
      
      MONTHS.forEach(m => {
        // filter vouchers of this category, this year, this month
        const matchedVouchers = vouchers.filter(v => {
          if (!v.date) return false;
          const year = getYearFromDate(v.date);
          const month = getMonthFromDate(v.date);
          const matchesYear = summaryYear === 'All' ? true : year === summaryYear;
          return matchesYear && month === m.value && v.category === cat;
        });

        const kcmInsta = matchedVouchers.filter(v => v.vendor === 'kcm insta').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
        const kcmSupply = matchedVouchers.filter(v => v.vendor === 'kcm supply').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
        const total = kcmInsta + kcmSupply;

        monthData[m.value] = { kcmInsta, kcmSupply, total };
      });

      return {
        category: cat,
        months: monthData
      };
    });

    // Calculate vertical grand totals for each month column
    const grandTotals: Record<string, { kcmInsta: number; kcmSupply: number; total: number }> = {};
    MONTHS.forEach(m => {
      const monthlyVouchers = vouchers.filter(v => {
        if (!v.date) return false;
        const year = getYearFromDate(v.date);
        const month = getMonthFromDate(v.date);
        const matchesYear = summaryYear === 'All' ? true : year === summaryYear;
        return matchesYear && month === m.value;
      });

      const kcmInsta = monthlyVouchers.filter(v => v.vendor === 'kcm insta').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
      const kcmSupply = monthlyVouchers.filter(v => v.vendor === 'kcm supply').reduce((sum, v) => sum + (v.cashPaid || 0), 0);
      const total = kcmInsta + kcmSupply;

      grandTotals[m.value] = { kcmInsta, kcmSupply, total };
    });

    return { reportData, grandTotals };
  };

  const { reportData, grandTotals } = generateSummaryReport();

  // Export summary matrix as Excel
  const handleExportSummaryCSV = () => {
    const rows: any[][] = [];
    
    // Title row
    rows.push([`KCM Logistics Petty Cash Summary Report - Year ${summaryYear}`]);
    rows.push([]); // blank row

    // First header line: Category, Month names spanned
    const headerRow = ['Expense Category'];
    MONTHS.forEach(m => {
      headerRow.push(`${m.label} (KCM INSTA)`, `${m.label} (KCM SUPPLY)`, `${m.label} (Total)`);
    });
    rows.push(headerRow);

    // Rows
    reportData.forEach(row => {
      const rRow: (string | number)[] = [row.category];
      MONTHS.forEach(m => {
        const data = row.months[m.value];
        rRow.push(data.kcmInsta, data.kcmSupply, data.total);
      });
      rows.push(rRow);
    });

    // Grand Total Row
    const grandTotalRow: (string | number)[] = ['GRAND TOTALS'];
    MONTHS.forEach(m => {
      const gt = grandTotals[m.value];
      grandTotalRow.push(gt.kcmInsta, gt.kcmSupply, gt.total);
    });
    rows.push(grandTotalRow);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Summary Matrix");
    XLSX.writeFile(workbook, `KCM_Petty_Cash_Summary_Report_${summaryYear}.xlsx`);
    triggerNotif('Summary Monthly Matrix Excel downloaded successfully!', 'success');
  };

  const mainContent = (
    <div className={`space-y-6 ${isFullscreen ? 'p-6 md:p-8 bg-slate-50 min-h-screen' : ''}`} id="pettycash-vouchers-system">
      {/* Header and navigation tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 font-sans flex items-center gap-2">
            <Landmark className="text-teal-600 w-5 h-5" />
            Petty Cash & Branch Vouchers Desk {isFullscreen && <span className="text-xs bg-teal-500 text-white font-mono px-2 py-0.5 rounded-full uppercase tracking-widest font-black animate-pulse">Fullscreen Desk</span>}
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Secure multi-vendor operational expense ledger & consolidated summary reporting system
          </p>
        </div>
        <div className="flex items-center gap-2 mt-4 md:mt-0">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold mr-1">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Petty Cash Details
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidated Summary
            </button>
          </div>

          {activeTab === 'ledger' && (
            <button
              onClick={() => setShowForm(prev => !prev)}
              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold p-2 rounded-xl shadow-2xs transition-all cursor-pointer"
              title={showForm ? "Hide Entry Form (Expand Table to Full Width)" : "Show Entry Form Sidebar"}
            >
              {showForm ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-teal-600" />}
            </button>
          )}

          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className={`border font-bold p-2 rounded-xl shadow-2xs transition-all cursor-pointer ${
              isFullscreen 
                ? 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 animate-pulse' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
            title={isFullscreen ? "Exit Fullscreen Desk View" : "Enter Immersive Fullscreen Workspace"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {notif && (
        <div
          className={`p-3 border rounded-xl text-xs font-medium flex items-center gap-2.5 shadow-sm transition-all animate-fade-in ${
            notif.type === 'success'
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : notif.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <CheckCircle2 className={`w-4 h-4 ${notif.type === 'success' ? 'text-teal-600' : notif.type === 'error' ? 'text-red-500' : 'text-blue-500'} shrink-0`} />
          <span className="font-sans leading-relaxed">{notif.message}</span>
        </div>
      )}

      {activeTab === 'ledger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="petty-cash-form-container">
          {/* Section 1 Left: record petty cash voucher form */}
          {showForm && (
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 lg:col-span-4 h-fit text-xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                {editingId ? <CheckCircle2 className="w-4 h-4 text-amber-500 font-bold" /> : <Plus className="w-4 h-4 text-teal-600 font-bold" />}
                {editingId ? 'Edit Petty Cash Entry' : 'Add Petty Cash Entry'}
              </h2>
              <span className="text-[10px] font-mono font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-100">
                STAFF USE ONLY
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Date Input with helper text */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Date *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 pointer-events-none">
                    <Calendar className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <p className="text-[9px] text-slate-400 font-mono mt-0.5">Select year, month & day calendar</p>
              </div>

              {/* Entry Number */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Entry Number *</label>
                <input
                  type="text"
                  required
                  value={entryNo}
                  onChange={(e) => setEntryNo(e.target.value)}
                  placeholder="e.g. ENT-2026-1049"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold tracking-wider text-slate-800 uppercase focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* Searchable Expense Category Dropdown */}
              <div className="relative" ref={categoryDropdownRef}>
                <label className="block font-semibold text-slate-700 mb-1">Expense Category *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Type to search and select category..."
                    value={categoryInput}
                    onChange={(e) => {
                      setCategoryInput(e.target.value);
                      setShowCategoryDropdown(true);
                    }}
                    onFocus={() => setShowCategoryDropdown(true)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                  />
                  <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 pointer-events-none">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </span>
                </div>
                
                {showCategoryDropdown && suggestedCategories.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-50">
                    {suggestedCategories.map((cat, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCategoryInput(cat);
                          setShowCategoryDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-teal-600 font-medium transition-colors text-xs flex items-center justify-between"
                      >
                        <span>{cat}</span>
                        {categoryInput === cat && <Check className="w-3 h-3 text-teal-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Location *</label>
                <input
                  type="text"
                  required
                  placeholder="Manual branch or location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* Client Name (swiggy, RIL F&V, market load, other) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Client Name *</label>
                  <select
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                  >
                    {CLIENT_NAMES.map((client, idx) => (
                      <option key={idx} value={client}>{client}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vendor Entity *</label>
                  <select
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-bold uppercase text-[10px]"
                  >
                    <option value="kcm supply">KCM SUPPLY</option>
                    <option value="kcm insta">KCM INSTA</option>
                  </select>
                </div>
              </div>

              {clientName === 'Other' && (
                <div>
                  <label className="block font-semibold text-teal-700 mb-1">Specify Other Client Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter custom client"
                    value={customClientName}
                    onChange={(e) => setCustomClientName(e.target.value)}
                    className="w-full bg-teal-50/50 border border-teal-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
                  />
                </div>
              )}

              {/* Vehicle Number & Receiver */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    placeholder="e.g. KA53AA0069"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Receiver Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Cash recipient"
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Vendor ID & Trip Sheet */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vendor ID</label>
                  <input
                    type="text"
                    placeholder="Vendor Identification"
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trip Sheet #</label>
                  <input
                    type="text"
                    placeholder="e.g. TRIP-9121"
                    value={tripSheet}
                    onChange={(e) => setTripSheet(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Numeric Financial Fields: Amount Received, Cash Paid, Balance (Auto Calculated but editable) */}
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-100">
                <div>
                  <label className="block font-bold text-slate-600 mb-0.5 text-[9px] uppercase">Amt Received</label>
                  <input
                    type="number"
                    placeholder="₹ Rec"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-slate-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-teal-700 mb-0.5 text-[9px] uppercase">Cash Paid (Exp)</label>
                  <input
                    type="number"
                    placeholder="₹ Paid"
                    value={cashPaid}
                    onChange={(e) => setCashPaid(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-mono font-bold text-teal-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-700 mb-0.5 text-[9px] uppercase">Balance Net</label>
                  <input
                    type="number"
                    placeholder="₹ Bal"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-lg p-1.5 font-mono font-bold text-amber-800 text-[11px] focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Remarks & Descriptions</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Specify brief notes or details for ledger auditing..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 h-14 focus:outline-none text-slate-800"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 font-semibold tracking-wide uppercase transition-colors shadow-xs mt-2 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : editingId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-amber-400 font-bold" />
                      Update Voucher
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Commit Voucher Entry
                    </>
                  )}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl px-4 py-2.5 font-semibold tracking-wide uppercase transition-colors mt-2 cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
          )}

          {/* Section 1 Right: Ledgers, Filters, Search, Actions (Export, Import, Download, Share) */}
          <div className={`bg-white rounded-2xl shadow-xs border border-slate-200 p-5 ${showForm ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col space-y-4`}>
            
            {/* Action Bar (Import, Export, Download, Share) */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
              <div className="font-semibold text-slate-800 flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Ledger Operations:
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Import CSV */}
                <input
                  type="file"
                  accept=".csv,.json"
                  ref={fileInputRef}
                  onChange={handleCSVImport}
                  className="hidden"
                  disabled={isImportingLedger}
                />
                <button
                  type="button"
                  disabled={isImportingLedger}
                  onClick={() => fileInputRef.current?.click()}
                  className={`bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all ${isImportingLedger ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
                  title="Import petty cash ledger data from CSV/JSON files"
                >
                  {isImportingLedger ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                      <span>Importing ({importProgress.current}/{importProgress.total})...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-teal-600" />
                      Import
                    </>
                  )}
                </button>

                {isImportingLedger && (
                  <button
                    type="button"
                    onClick={() => { cancelImportRef.current = true; }}
                    className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all animate-pulse"
                    title="Stop ongoing import"
                  >
                    <X className="w-3.5 h-3.5" />
                    Stop Import
                  </button>
                )}



                {/* Export CSV */}
                <button
                  type="button"
                  onClick={handleCSVExport}
                  className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Export filtered records as spreadsheet Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  Export
                </button>

                {/* Download / Print */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Trigger system print formatting layout"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  Print
                </button>

                {/* Share summary */}
                <button
                  type="button"
                  onClick={handleShareLedger}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title="Copy a beautiful summary text to clipboard for WhatsApp/Slack"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Report
                </button>
              </div>
            </div>

            {/* Robust Filter Console */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs text-xs space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 font-bold text-slate-700 text-[10px] uppercase tracking-wider">
                <span className="flex items-center gap-1"><Filter className="w-3 h-3 text-teal-600" /> Filters & Historical Lookup</span>
                <span>Matches: {filteredVouchers.length} entries</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {/* Year Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Year Lookup</label>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Years</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                </div>

                {/* Month Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Month Lookup</label>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Months</option>
                    {MONTHS.map((m, idx) => (
                      <option key={idx} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {/* Vendor Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vendor filter</label>
                  <select
                    value={selectedVendorFilter}
                    onChange={(e) => setSelectedVendorFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-bold uppercase text-[9px] text-slate-700"
                  >
                    <option value="All">All Vendors</option>
                    {VENDORS.map((v, idx) => (
                      <option key={idx} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Category Filter</label>
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-700"
                  >
                    <option value="All">All Categories</option>
                    {EXPENSE_CATEGORIES.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Live search input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Keyword Search</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. entry, receiver"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400">
                      <Search className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vouchers Table Ledger View */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs flex-1 min-h-[350px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0f172a] text-slate-200 font-sans tracking-wide uppercase text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Entry No</th>
                    <th className="px-3 py-2.5">Expense Category</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-3 py-2.5">Client</th>
                    <th className="px-3 py-2.5">Vendor</th>
                    <th className="px-3 py-2.5">Vehicle #</th>
                    <th className="px-3 py-2.5">Receiver</th>
                    <th className="px-3 py-2.5">Vendor ID</th>
                    <th className="px-3 py-2.5 text-right">Amt Rec</th>
                    <th className="px-3 py-2.5 text-right">Cash Paid</th>
                    <th className="px-3 py-2.5 text-right">Balance</th>
                    <th className="px-3 py-2.5">Trip Sheet</th>
                    <th className="px-3 py-2.5">Remarks</th>
                    <th className="px-3 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {filteredVouchers.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="text-center py-16 text-slate-400 font-mono text-xs">
                        NO RECORDED PETTY CASH VOUCHERS MATCH THE SELECTION.
                        <div className="text-[10px] text-slate-400 font-sans mt-1">Use the left form to authorize new cash disbursements.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredVouchers.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors text-[11px]">
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{v.date}</td>
                        <td className="px-3 py-2 font-bold font-mono text-slate-900 whitespace-nowrap">{v.entryNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[9px] font-bold uppercase">
                            {v.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[100px] truncate" title={v.location}>{v.location || '-'}</td>
                        <td className="px-3 py-2 text-slate-800 font-semibold whitespace-nowrap">{v.clientName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            v.vendor === 'kcm insta' ? 'bg-pink-50 text-pink-700 border border-pink-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {v.vendor}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-800 whitespace-nowrap">{v.vehicleNumber || '-'}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{v.receiver}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{v.vendorId || '-'}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">₹{(v.amountReceived || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-red-700 bg-red-50/20">₹{(v.cashPaid || 0).toLocaleString('en-IN')}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${v.balance < 0 ? 'text-rose-600 bg-rose-50/30' : 'text-emerald-700 bg-emerald-50/30'}`}>
                          ₹{(v.balance || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{v.tripSheet || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate" title={v.remarks}>{v.remarks || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenDocModal(v)}
                              className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer flex items-center gap-1"
                              title="Manage Attachments"
                            >
                              <Paperclip className="w-3 h-3" />
                              {v.documents && v.documents.length > 0 ? `Docs (${v.documents.length})` : 'Docs'}
                            </button>
                            <button
                              onClick={() => handleStartEdit(v)}
                              className="text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                              title="Edit this entry"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete entry ${v.entryNo}?`)) {
                                  onDeleteVoucher(v.id);
                                  triggerNotif(`Deleted entry ${v.entryNo} successfully!`, 'success');
                                }
                              }}
                              className="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                              title="Delete this entry"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mini KPIs totals */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Total Received Float</span>
                <div className="text-sm font-black text-slate-800 font-mono mt-0.5">
                  ₹{filteredVouchers.reduce((s,v)=>s+(v.amountReceived || 0), 0).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-rose-50/30 p-3 rounded-xl border border-rose-100">
                <span className="text-[10px] text-rose-500 font-bold uppercase">Total Disbursed Expenses</span>
                <div className="text-sm font-black text-rose-700 font-mono mt-0.5">
                  ₹{filteredVouchers.reduce((s,v)=>s+(v.cashPaid || 0), 0).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="bg-emerald-50/30 p-3 rounded-xl border border-emerald-100">
                <span className="text-[10px] text-emerald-600 font-bold uppercase">Net Remaining Balance</span>
                <div className="text-sm font-black text-emerald-700 font-mono mt-0.5">
                  ₹{filteredVouchers.reduce((s,v)=>s+(v.balance || 0), 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Section 2 Summary: Monthly reporting matrix layout with download option */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Monthly Petty Cash Summary Report
              </h2>
              <p className="text-slate-500 font-mono text-[10px] mt-0.5">
                Multi-vendor monthly matrix. Automatically groups expenses by category and calculates math totals.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-600 uppercase text-[9px] font-mono">Select Reporting Year</span>
                <select
                  value={summaryYear}
                  onChange={(e) => setSummaryYear(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md px-2 py-0.5 font-bold text-slate-800"
                >
                  <option value="All">All Years</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>

              <input
                type="file"
                accept=".csv"
                ref={summaryFileInputRef}
                onChange={handleSummaryCSVImport}
                className="hidden"
                disabled={isImportingSummary}
              />

              <button
                disabled={isImportingSummary}
                onClick={() => summaryFileInputRef.current?.click()}
                className={`bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${isImportingSummary ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
                title="Upload/Import a completed Monthly Summary Matrix CSV"
              >
                {isImportingSummary ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-teal-600 animate-spin" />
                    <span>Importing ({importProgress.current}/{importProgress.total})...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 text-teal-600" />
                    Import Summary
                  </>
                )}
              </button>

              {isImportingSummary && (
                <button
                  type="button"
                  onClick={() => { cancelImportRef.current = true; }}
                  className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs animate-pulse"
                  title="Stop ongoing import"
                >
                  <X className="w-3.5 h-3.5" />
                  Stop Import
                </button>
              )}

              {onClearImportedPettyCash && (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm("Are you sure you want to remove all imported consolidated summary vouchers? This will delete all imported records but preserve manually logged vouchers.")) {
                      try {
                        await onClearImportedPettyCash();
                        triggerNotif("Imported consolidated summary vouchers successfully removed!", "success");
                      } catch (err) {
                        triggerNotif("Failed to clear imported summary.", "error");
                      }
                    }
                  }}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Remove all imported summary vouchers"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Imported
                </button>
              )}

              <button
                onClick={handleExportSummaryCSV}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Download Report (Excel)
              </button>
            </div>
          </div>

          {/* Matrix table with horizontal scroll */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#0f172a] text-slate-200 text-[9px] uppercase tracking-wider sticky top-0 z-15 divide-x divide-slate-800">
                <tr>
                  <th rowSpan={2} className="px-3 py-3 text-slate-200 font-sans uppercase tracking-widest min-w-[200px] align-middle sticky left-0 bg-[#0f172a] z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                    Expense Category
                  </th>
                  {MONTHS.map((m, idx) => (
                    <th key={idx} colSpan={3} className="px-3 py-1.5 text-center bg-slate-800/80 font-bold border-b border-slate-700 text-teal-400">
                      {m.label} ({summaryYear})
                    </th>
                  ))}
                </tr>
                <tr className="bg-[#1e293b] text-slate-300 divide-x divide-slate-700">
                  {MONTHS.map((m, idx) => (
                    <React.Fragment key={idx}>
                      <th className="px-2 py-1 text-center font-bold text-[8px] min-w-[70px] text-pink-400 font-mono uppercase">KCM INSTA</th>
                      <th className="px-2 py-1 text-center font-bold text-[8px] min-w-[75px] text-sky-400 font-mono uppercase">KCM SUPPLY</th>
                      <th className="px-2 py-1 text-center font-bold text-[8px] min-w-[80px] bg-slate-900 text-emerald-400">Total Exp</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                {reportData.map((row, idx) => {
                  // Determine if category has any actual non-zero data
                  const hasData = Object.values(row.months).some(m => m.total > 0);
                  return (
                    <tr key={idx} className={`hover:bg-slate-50/50 transition-colors divide-x divide-slate-100 text-[10px] ${!hasData ? 'opacity-45' : ''}`}>
                      <td className="px-3 py-2 font-bold text-slate-900 bg-slate-50 sticky left-0 z-10 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {row.category}
                      </td>
                      {MONTHS.map((m, mIdx) => {
                        const cell = row.months[m.value];
                        return (
                          <React.Fragment key={mIdx}>
                            <td 
                              onClick={() => cell.kcmInsta > 0 && setSelectedCellFilter({ category: row.category, month: m.value, vendor: 'kcm insta' })}
                              className={`px-2 py-2 text-right font-mono text-slate-500 ${cell.kcmInsta > 0 ? 'hover:bg-teal-50 hover:text-teal-900 hover:underline cursor-pointer transition-colors' : ''}`}
                              title={cell.kcmInsta > 0 ? "Click to view, edit or delete KCM Insta entries" : undefined}
                            >
                              {cell.kcmInsta > 0 ? `₹${cell.kcmInsta.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td 
                              onClick={() => cell.kcmSupply > 0 && setSelectedCellFilter({ category: row.category, month: m.value, vendor: 'kcm supply' })}
                              className={`px-2 py-2 text-right font-mono text-slate-500 ${cell.kcmSupply > 0 ? 'hover:bg-teal-50 hover:text-teal-900 hover:underline cursor-pointer transition-colors' : ''}`}
                              title={cell.kcmSupply > 0 ? "Click to view, edit or delete KCM Supply entries" : undefined}
                            >
                              {cell.kcmSupply > 0 ? `₹${cell.kcmSupply.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td 
                              onClick={() => cell.total > 0 && setSelectedCellFilter({ category: row.category, month: m.value, vendor: 'all' })}
                              className={`px-2 py-2 text-right font-mono font-bold bg-emerald-50/20 text-emerald-800 ${cell.total > 0 ? 'hover:bg-emerald-100 hover:text-emerald-950 hover:underline cursor-pointer transition-colors' : ''}`}
                              title={cell.total > 0 ? "Click to view, edit or delete all entries" : undefined}
                            >
                              {cell.total > 0 ? `₹${cell.total.toLocaleString('en-IN')}` : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* GRAND TOTAL ROW */}
                <tr className="bg-slate-900 text-white font-sans tracking-wide uppercase text-[10px] divide-x divide-slate-800 sticky bottom-0 z-10 font-bold border-t-2 border-slate-700 shadow-[0_-2px_5px_-1px_rgba(0,0,0,0.15)]">
                  <td className="px-3 py-3 font-black bg-slate-950 sticky left-0 z-25 text-teal-400 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                    GRAND TOTALS
                  </td>
                  {MONTHS.map((m, idx) => {
                    const gt = grandTotals[m.value];
                    return (
                      <React.Fragment key={idx}>
                        <td className="px-2 py-3 text-right font-mono text-pink-300">
                          {gt.kcmInsta > 0 ? `₹${gt.kcmInsta.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="px-2 py-3 text-right font-mono text-sky-300">
                          {gt.kcmSupply > 0 ? `₹${gt.kcmSupply.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="px-2 py-3 text-right font-mono font-black text-emerald-400 bg-slate-950">
                          {gt.total > 0 ? `₹${gt.total.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-mono flex items-start gap-2.5">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-700">Audit Calculation Note:</span> Under each reporting month, the columns represent:
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li><span className="font-bold text-slate-700">KCM INSTA</span>: Expenditures marked for KCM INSTA vendor.</li>
                <li><span className="font-bold text-slate-700">KCM SUPPLY</span>: Expenditures marked for KCM SUPPLY vendor.</li>
                <li><span className="font-bold text-teal-700">Total Expenses</span>: Dynamically calculated mathematically as <code className="bg-slate-100 px-1 rounded">KCM INSTA + KCM SUPPLY</code> expenses for that category.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Share clipboard fallback modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl space-y-4 text-xs font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase">Share Petty Cash Report</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer">×</button>
            </div>
            <p className="text-slate-600">Your browser blocked direct clipboard writes. You can copy the ledger summary text below manually to share with teammates:</p>
            <textarea
              readOnly
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="w-full h-40 bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-[10px] text-slate-700 focus:outline-none"
              value={`KCM LOGISTICS - PETTY CASH VOUCHERS REPORT
Date Filter: Year ${filterYear} / Month ${filterMonth}
Total Records: ${filteredVouchers.length}
Total Received: ₹${filteredVouchers.reduce((s,v)=>s+(v.amountReceived || 0), 0).toLocaleString('en-IN')}
Total Expenses: ₹${filteredVouchers.reduce((s,v)=>s+(v.cashPaid || 0), 0).toLocaleString('en-IN')}
Remaining Balance: ₹${filteredVouchers.reduce((s,v)=>s+(v.balance || 0), 0).toLocaleString('en-IN')}`}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`KCM LOGISTICS - PETTY CASH VOUCHERS REPORT...`);
                setShowShareModal(false);
              }}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2 font-semibold cursor-pointer text-center"
            >
              Okay, Copy & Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Drill-down modal for Consolidated Summary cell entries */}
      {selectedCellFilter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans text-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-pink-400" />
                  Consolidated Entries: {selectedCellFilter.category} ({MONTHS.find(m => m.value === selectedCellFilter.month)?.label} {summaryYear})
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-widest">
                  Source filter: {selectedCellFilter.vendor === 'all' ? 'All Vendors' : selectedCellFilter.vendor}
                </p>
              </div>
              <button 
                onClick={() => setSelectedCellFilter(null)} 
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Entry No</th>
                      <th className="px-4 py-2.5">Vendor</th>
                      <th className="px-4 py-2.5">Client & Vehicle</th>
                      <th className="px-4 py-2.5">Receiver</th>
                      <th className="px-4 py-2.5">Remarks / Particulars</th>
                      <th className="px-4 py-2.5 text-right">Cash Paid</th>
                      <th className="px-4 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {vouchers.filter(v => {
                      if (!v.date) return false;
                      const yr = getYearFromDate(v.date);
                      const mn = getMonthFromDate(v.date);
                      const matchesCat = v.category === selectedCellFilter.category;
                      const matchesYr = summaryYear === 'All' ? true : yr === summaryYear;
                      const matchesMn = mn === selectedCellFilter.month;
                      const matchesVendor = selectedCellFilter.vendor === 'all' || v.vendor === selectedCellFilter.vendor;
                      return matchesCat && matchesYr && matchesMn && matchesVendor;
                    }).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-mono">
                          No contributing entries found for this cell.
                        </td>
                      </tr>
                    ) : (
                      vouchers.filter(v => {
                        if (!v.date) return false;
                        const yr = getYearFromDate(v.date);
                        const mn = getMonthFromDate(v.date);
                        const matchesCat = v.category === selectedCellFilter.category;
                        const matchesYr = summaryYear === 'All' ? true : yr === summaryYear;
                        const matchesMn = mn === selectedCellFilter.month;
                        const matchesVendor = selectedCellFilter.vendor === 'all' || v.vendor === selectedCellFilter.vendor;
                        return matchesCat && matchesYr && matchesMn && matchesVendor;
                      }).map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50 transition-colors text-[11px]">
                          <td className="px-4 py-2.5 font-mono whitespace-nowrap">{v.date}</td>
                          <td className="px-4 py-2.5 font-mono font-bold whitespace-nowrap">{v.entryNo || '-'}</td>
                          <td className="px-4 py-2.5 capitalize font-semibold whitespace-nowrap">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              v.vendor === 'kcm insta' ? 'bg-pink-50 text-pink-700 border border-pink-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}>
                              {v.vendor}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{v.clientName}</div>
                            {v.vehicleNumber && <div className="text-[9px] text-slate-500 font-mono">{v.vehicleNumber}</div>}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{v.receiver}</td>
                          <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate" title={v.remarks}>{v.remarks || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-rose-700 bg-rose-50/20 whitespace-nowrap">₹{(v.cashPaid || 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenDocModal(v)}
                                className="px-2 py-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors font-bold text-[10px] cursor-pointer flex items-center gap-1"
                                title="Manage Attachments"
                              >
                                <Paperclip className="w-3 h-3" />
                                {v.documents && v.documents.length > 0 ? `Docs (${v.documents.length})` : 'Docs'}
                              </button>
                              <button
                                onClick={() => {
                                  handleStartEdit(v);
                                  setSelectedCellFilter(null);
                                }}
                                className="px-2 py-1 text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                                title="Edit Entry"
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Are you sure you want to delete entry ${v.entryNo}?`)) {
                                    try {
                                      await onDeleteVoucher(v.id!);
                                      triggerNotif(`Deleted entry ${v.entryNo} successfully!`, 'success');
                                    } catch (err) {
                                      console.error(err);
                                      triggerNotif('Failed to delete voucher.', 'error');
                                    }
                                  }
                                }}
                                className="px-2 py-1 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors font-bold text-[10px] cursor-pointer"
                                title="Delete Entry"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-end">
              <button
                onClick={() => setSelectedCellFilter(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document management modal */}
      {selectedVoucherForDocs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-xs">
            {/* Header */}
            <div className="bg-[#0f172a] text-white p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-teal-400" />
                  Voucher Documents: {selectedVoucherForDocs.entryNo}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
                  Category: {selectedVoucherForDocs.category} • Receiver: {selectedVoucherForDocs.receiver}
                </p>
              </div>
              <button 
                onClick={() => setSelectedVoucherForDocs(null)} 
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              <DocumentAttachment
                documents={selectedVoucherForDocs.documents || []}
                onChange={async (updatedDocs) => {
                  try {
                    await onUpdateVoucher(selectedVoucherForDocs.id, { documents: updatedDocs });
                    setSelectedVoucherForDocs({
                      ...selectedVoucherForDocs,
                      documents: updatedDocs
                    });
                    triggerNotif('📎 Documents updated successfully.', 'success');
                  } catch (err) {
                    console.error(err);
                    triggerNotif('Failed to update documents.', 'error');
                  }
                }}
                label="Attached Voucher Receipts & Invoices"
              />
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-end">
              <button
                onClick={() => setSelectedVoucherForDocs(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto font-sans text-slate-900 shadow-2xl flex flex-col">
        <div className="flex-1 w-full">
          {mainContent}
        </div>
      </div>
    );
  }

  return mainContent;
}
