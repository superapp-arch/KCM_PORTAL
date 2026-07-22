import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StaffEmployee, StaffSalaryStructure, StaffSalaryDeduction } from '../types.ts';

export interface SalarySlipData {
  employee: StaffEmployee;
  structure: StaffSalaryStructure;
  deduction?: StaffSalaryDeduction;
  month: string; // YYYY-MM
  grossSalary: number;
  deductionsTotal: number;
  netSalary: number;
  paidDays: number;
  totalDaysInMonth: number;
  ytdGross: number;
  ytdNet: number;
  hikeAmount: number;
}

function formatCurrency(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
}

export function generateSalarySlipPdf(slip: SalarySlipData): Buffer {
  const doc = new jsPDF();
  const { employee, structure, deduction, month } = slip;

  doc.setFontSize(16);
  doc.text('KCM Logistics - Salary Slip', 14, 18);
  doc.setFontSize(10);
  doc.text(`Month: ${month}`, 14, 26);

  autoTable(doc, {
    startY: 32,
    theme: 'plain',
    styles: { fontSize: 9 },
    body: [
      ['Employee ID', employee.id, 'Name', employee.name],
      ['Designation', employee.designation || '-', 'Department', employee.department || '-'],
      ['Location', employee.location || '-', 'Date of Joining', employee.dateOfJoining || '-'],
      ['Bank A/C No.', employee.bankAccountNumber || '-', 'IFSC', employee.ifscCode || '-'],
      ['Paid Days', `${slip.paidDays} / ${slip.totalDaysInMonth}`, 'Status', employee.status],
    ],
  });

  const earningsRows: (string | number)[][] = [
    ['Basic Salary', formatCurrency(structure.basicSalary || 0)],
    ['HRA', formatCurrency(structure.hra || 0)],
    ['Dearness Allowance', formatCurrency(structure.dearnessAllowance || 0)],
    ['Special Allowance', formatCurrency(structure.specialAllowance || 0)],
    ['Other Additions', formatCurrency(structure.otherAdditions || 0)],
  ];
  if (slip.hikeAmount) earningsRows.push(['Salary Hike', formatCurrency(slip.hikeAmount)]);
  earningsRows.push(['Gross Salary (prorated)', formatCurrency(slip.grossSalary)]);

  const deductionRows: (string | number)[][] = [
    ['PF Contribution', formatCurrency(deduction?.pfContribution || 0)],
    ['ESI Contribution', formatCurrency(deduction?.esiContribution || 0)],
    ['Income Tax', formatCurrency(deduction?.incomeTax || 0)],
    ['Other Deductions', formatCurrency(deduction?.otherDeductions || 0)],
    ['Total Deductions', formatCurrency(slip.deductionsTotal)],
  ];

  const afterHeaderY = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: afterHeaderY,
    head: [['Earnings', 'Amount']],
    body: earningsRows,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 27, 75] },
  });

  const afterEarningsY = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: afterEarningsY,
    head: [['Deductions', 'Amount']],
    body: deductionRows,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [136, 19, 55] },
  });

  const afterDeductionsY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(12);
  doc.text(`Net Pay: ${formatCurrency(slip.netSalary)}`, 14, afterDeductionsY);

  doc.setFontSize(9);
  doc.text(`Year-to-date Gross: ${formatCurrency(slip.ytdGross)}`, 14, afterDeductionsY + 8);
  doc.text(`Year-to-date Net: ${formatCurrency(slip.ytdNet)}`, 14, afterDeductionsY + 14);

  doc.setFontSize(8);
  doc.text('This is a system-generated salary slip and does not require a signature.', 14, 285);

  return Buffer.from(doc.output('arraybuffer'));
}
