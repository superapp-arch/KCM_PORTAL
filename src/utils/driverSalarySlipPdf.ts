// Renders a DriverSalarySlipRecord (an already-frozen snapshot - see
// types.ts) into a PDF, using the same jsPDF + jspdf-autotable toolchain as
// HR & Payroll's Salary Slip (src/utils/salarySlipPdf.ts) - same look, same
// month-based layout, just for a driver's Salary Breakup instead of a
// StaffProvidentFund record.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DriverSalarySlipRecord } from '../types';
import { numberToIndianWords } from './numberToWords';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : month;
}

const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

export function buildDriverSalarySlipDoc(slip: DriverSalarySlipRecord): jsPDF {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('KCM LOGISTICS', 105, 16, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Driver Salary Slip - ${monthLabel(slip.month)}`, 105, 23, { align: 'center' });
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 28, 196, 28);

  // Driver details block
  autoTable(doc, {
    startY: 33,
    body: [
      ['Driver Name', slip.driverName, 'Driver ID', slip.driverId],
      ['Vehicle No', slip.vehicleNo || '-', 'Location', slip.location],
      ['Bank Account', slip.bankAccountNumberMasked || '-', 'IFSC Code', slip.ifscCode || '-']
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [100, 116, 139] },
      2: { fontStyle: 'bold', textColor: [100, 116, 139] }
    }
  });

  let cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Attendance summary for the month
  autoTable(doc, {
    startY: cursorY,
    head: [['No. of Days', 'Working Days', 'LOP Days', 'Exemption Leave']],
    body: [[String(slip.totalDays), String(slip.presentDays), String(slip.lopDays), String(slip.exemptionLeaveDays)]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [30, 64, 175] }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Gross Salary / Earnings - the pro-rated adjustment line makes the two
  // body rows above Other Additions sum exactly to Total Earnings (Gross
  // Earned + Other Additions) even though Gross Salary itself shown for
  // reference is the full, un-prorated monthly figure.
  const proratedAdjustment = (slip.grossEarned ?? slip.grossSalary ?? 0) - (slip.grossSalary || 0);
  const earningsRows: [string, string][] = [
    ['Gross Salary', rupee(slip.grossSalary)],
    ...(proratedAdjustment !== 0 ? [['Pro-rated for Working Days', rupee(proratedAdjustment)] as [string, string]] : []),
    ['Other Additions', rupee(slip.otherAdditions)]
  ];
  autoTable(doc, {
    startY: cursorY,
    head: [['Earnings', 'Amount']],
    body: earningsRows,
    foot: [['Total Earnings', rupee(slip.totalEarnings)]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [16, 185, 129] },
    footStyles: { fillColor: [236, 253, 245], textColor: [4, 120, 87], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Deductions table
  const deductionsRows: [string, string][] = [
    ['Petty Cash/Advance', rupee(slip.pettyCashAdvance)],
    ['Loan Deduction', rupee(slip.loanDeduction)],
    ['Recovery Amount', rupee(slip.recoveryAmount)],
    ['Driver Welfare', rupee(slip.driverWelfare)],
    ['BATA', rupee(slip.bata)]
  ];
  if (slip.lopDays > 0) deductionsRows.push([`LOP (${slip.lopDays} day${slip.lopDays === 1 ? '' : 's'})`, rupee(slip.lopAmount)]);
  const totalDeductionsWithLop = slip.totalDeductions + slip.lopAmount;
  autoTable(doc, {
    startY: cursorY,
    head: [['Deductions', 'Amount']],
    body: deductionsRows,
    foot: [['Total Deductions', rupee(totalDeductionsWithLop)]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [225, 29, 72] },
    footStyles: { fillColor: [255, 241, 242], textColor: [190, 18, 60], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } }
  });
  cursorY = (doc as any).lastAutoTable.finalY + 8;

  // Net Salary - highlighted
  doc.setFillColor(88, 28, 135);
  doc.roundedRect(14, cursorY, 182, 18, 2, 2, 'F');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('NET SALARY', 20, cursorY + 11);
  doc.setFontSize(14);
  doc.text(rupee(slip.netSalary), 190, cursorY + 11, { align: 'right' });
  cursorY += 24;

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(numberToIndianWords(slip.netSalary), 14, cursorY);
  cursorY += 12;

  // Footer
  doc.setDrawColor(203, 213, 225);
  doc.line(14, cursorY, 196, cursorY);
  cursorY += 6;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Slip Number: ${slip.slipNumber}`, 14, cursorY);
  doc.text(`Generated: ${slip.generatedDate}`, 196, cursorY, { align: 'right' });
  cursorY += 6;
  doc.setFont('helvetica', 'italic');
  doc.text('This is a system-generated slip and does not require a signature.', 105, cursorY, { align: 'center' });

  return doc;
}

export function buildDriverSalarySlipFile(slip: DriverSalarySlipRecord): File {
  const blob: Blob = buildDriverSalarySlipDoc(slip).output('blob');
  return new File([blob], `${slip.slipNumber}.pdf`, { type: 'application/pdf' });
}
