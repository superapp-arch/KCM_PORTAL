import React, { useState } from 'react';
import { BillingInvoice, BillingCompany } from '../../types';
import {
  downloadBillingImportTemplate, parseBillingImportFile, buildInvoiceFromImportRow,
  exportErrorRowsToExcel, ParsedBillingImportRow
} from '../../utils/billingImportExport';
import ImportWizardModal from '../ImportWizardModal';

interface BillingImportModalProps {
  invoices: BillingInvoice[];
  onAddInvoice: (inv: Omit<BillingInvoice, 'id'>) => Promise<void>;
  onClose: () => void;
  onImported: () => void; // lets the parent refresh its list after a successful batch
  initialCompany: BillingCompany; // defaults to whichever tab was open when Import was clicked - still changeable here before choosing a file
}

// 2026-09-10: now a thin wrapper around the shared ImportWizardModal shell
// (src/components/ImportWizardModal.tsx) - this file owns only what's
// genuinely Billing-specific: the company scope toggle (chosen once, up
// front, for the whole file - every row gets tagged with it and only ever
// shows up under that company's own tab afterward, never mixed with the
// other company's rows), the preview table's own columns, and wiring
// parseBillingImportFile/buildInvoiceFromImportRow. The wizard mechanics
// (upload -> validate/preview -> confirm -> sequential import with
// progress/cancel -> summary) live entirely in the shared shell now.
export default function BillingImportModal({ invoices, onAddInvoice, onClose, onImported, initialCompany }: BillingImportModalProps) {
  const [company, setCompany] = useState<BillingCompany>(initialCompany);

  return (
    <ImportWizardModal<ParsedBillingImportRow>
      title="Import Invoices"
      infoText={
        <>
          Upload an Excel (.xlsx) or CSV file matching the template below. Every row is validated and previewed before anything is actually imported - nothing goes in blind.
          Total Amt, TDS Amount, and Amount Receivable are always recalculated from List Price/GST %/TDS Rate/Credit Note, never read as raw values from the file.
        </>
      }
      scopeToggle={{
        label: 'Which company does this file belong to? *',
        chipLabel: 'Company',
        value: company,
        options: (['KCM Insta', 'KCM Supply'] as BillingCompany[]).map(c => ({ value: c, label: c })),
        onChange: (v) => setCompany(v as BillingCompany),
        caption: `Every row in this file will be tagged ${company} and will only ever show up under that tab - never mixed with the other company's invoices.`
      }}
      onDownloadTemplate={downloadBillingImportTemplate}
      onParseFile={(file) => parseBillingImportFile(file, invoices, company)}
      previewColumns={company === 'KCM Supply'
        ? ['Row', 'Invoice No', 'Client', 'Entity', 'Mode', 'List Price', 'GST', 'Date', 'Status']
        : ['Row', 'Invoice No', 'Client', 'Entity', 'List Price', 'GST', 'Date', 'Status']}
      renderPreviewRow={(r) => {
        const base: (string | number)[] = [
          r.rowNumber, r.invoiceNo || '-', r.customerName || '-', r.entity || '-'
        ];
        if (company === 'KCM Supply') base.push(r.mode || '-');
        base.push(
          r.listPrice ? `₹${r.listPrice.toLocaleString('en-IN')}` : '-',
          `₹${((r.igst || 0) + (r.cgst || 0) + (r.sgst || 0)).toLocaleString('en-IN')}`,
          r.date || '-',
          r.paymentStatus
        );
        return base;
      }}
      onImportRow={(row) => onAddInvoice(buildInvoiceFromImportRow(row, company))}
      onDownloadErrorRows={exportErrorRowsToExcel}
      itemNounSingular="invoice"
      itemNounPlural="invoices"
      onClose={onClose}
      onImported={onImported}
    />
  );
}
