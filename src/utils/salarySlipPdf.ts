// Renders a SalarySlipRecord (an already-frozen snapshot - see types.ts) into
// a PDF, using the same jsPDF + jspdf-autotable toolchain already established
// for Reports & Analytics (src/utils/reportExport.ts) rather than introducing
// a second PDF approach.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SalarySlipRecord } from '../types';
import { numberToIndianWords } from './numberToWords';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]} ${y}` : month;
}

const rupee = (n: number | undefined) => `Rs. ${Math.round(n || 0).toLocaleString('en-IN')}`;

export function buildSalarySlipDoc(slip: SalarySlipRecord): jsPDF {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text('KCM LOGISTICS', 105, 16, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text(`Salary Slip - ${monthLabel(slip.month)}`, 105, 23, { align: 'center' });
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 28, 196, 28);

  // Employee details block
  autoTable(doc, {
    startY: 33,
    body: [
      ['Employee Name', slip.employeeName, 'Employee ID', slip.empId],
      ['Department', slip.department || '-', 'Month', monthLabel(slip.month)],
      ['Bank Name', slip.bankName || '-', 'IFSC Code', slip.ifscCode || '-'],
      ['Account Number', slip.bankAccountNumberMasked || '-', '', '']
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [100, 116, 139] },
      2: { fontStyle: 'bold', textColor: [100, 116, 139] }
    }
  });

  let cursorY = (doc as any).lastAutoTable.finalY + 6;

  // Earnings table
  const earningsRows: [string, string][] = [
    ['Basic Salary', rupee(slip.basic)],
    ['HRA', rupee(slip.hra)],
    ['Conveyance', rupee(slip.conveyance)],
    ['Medical Allowance', rupee(slip.medicalAllowance)],
    ['LTA', rupee(slip.lta)],
    ['CCA', rupee(slip.cca)],
    ['Fuel Allowance', rupee(slip.fuelAllowance)],
    ['Other Allowances', rupee(slip.otherAllowances)]
  ];
  if (slip.extraDays) earningsRows.push([`Extra Days (${slip.extraDays})`, rupee(slip.extraDaysAmount)]);

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
    ['Professional Tax', rupee(slip.professionalTax)],
    ['EPF', rupee(slip.epf)],
    ['ESI', rupee(slip.esi)]
  ];
  if (slip.lopDays) deductionsRows.push([`LOP (${slip.lopDays} day${slip.lopDays === 1 ? '' : 's'})`, rupee(slip.lopAmount)]);
  deductionsRows.push(
    ['Full & Final', rupee(slip.fullAndFinal)],
    ['Other Deductions', rupee(slip.otherDeductions)],
    ['Advances', rupee(slip.advances)],
    ['Income Tax', rupee(slip.incomeTax)]
  );

  autoTable(doc, {
    startY: cursorY,
    head: [['Deductions', 'Amount']],
    body: deductionsRows,
    foot: [['Total Deductions', rupee(slip.totalDeductions)]],
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

export function buildSalarySlipFile(slip: SalarySlipRecord): File {
  const blob: Blob = buildSalarySlipDoc(slip).output('blob');
  return new File([blob], `${slip.slipNumber}.pdf`, { type: 'application/pdf' });
}
