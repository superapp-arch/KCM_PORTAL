// Shared "resolve or generate a Service Invoice" logic for one Garage Work
// Order (MaintenanceRecord) - same shape as salarySlipGenerate.ts's
// resolveOrGenerateSlip, so there's exactly one place that decides the
// invoice number, builds the PDF, stores it, saves the ServiceInvoiceRecord,
// and writes the audit trail.
//
// Auto-numbering rule (confirmed with the user): invoiceNumber is only
// auto-generated (KCM-YYYY-NNNN, sequential within the year) when the work
// order's Authorised Service Station is exactly "KCM Service Station". For
// every other (external) station, the handler must have already typed a
// number into the work order's own Invoice Number field - this function
// throws if that's missing rather than silently inventing one.
import { authFetch } from '../authFetch';
import { MaintenanceRecord, ServiceInvoiceRecord, ServiceInvoiceAuditRecord, Vehicle, VehicleServiceSchedule, MaintenanceServiceStation } from '../types';
import { buildServiceInvoiceFile } from './serviceInvoicePdf';

export interface InvoiceGenerationResult {
  invoice: ServiceInvoiceRecord;
  isNew: boolean; // false = an existing invoice for this work order was found and reused, nothing was written
}

const KCM_STATION_NAME = 'kcm service station';

function nextInvoiceNumber(existingInvoices: ServiceInvoiceRecord[]): string {
  const year = new Date().getFullYear();
  const prefix = `KCM-${year}-`;
  const maxN = existingInvoices.reduce((max, inv) => {
    if (!inv.invoiceNumber || !inv.invoiceNumber.startsWith(prefix)) return max;
    const n = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `${prefix}${String(maxN + 1).padStart(4, '0')}`;
}

function regNoOf(v: Vehicle) { return (v.regNo || v['Reg. No.'] || '').trim().toUpperCase(); }

function nextServiceDueNote(regNo: string, schedules: VehicleServiceSchedule[]): string | undefined {
  const schedule = schedules.find(s => s.regNo === regNo);
  if (!schedule || schedule.lastServiceKm == null) return undefined;
  const dueKm = schedule.lastServiceKm + (schedule.serviceIntervalKm || 10000);
  return `${dueKm.toLocaleString('en-IN')} km`;
}

export async function resolveOrGenerateInvoice(params: {
  record: MaintenanceRecord;
  vehicles: Vehicle[];
  vehicleServiceSchedules: VehicleServiceSchedule[];
  serviceStations: MaintenanceServiceStation[];
  existingInvoices: ServiceInvoiceRecord[];
  forceRegenerate: boolean;
  performedBy: string;
}): Promise<InvoiceGenerationResult> {
  const { record, vehicles, vehicleServiceSchedules, serviceStations, existingInvoices, forceRegenerate, performedBy } = params;

  if (!forceRegenerate) {
    const existing = existingInvoices.find(i => i.maintenanceRecordId === record.id);
    if (existing) return { invoice: existing, isNew: false };
  }

  const station = serviceStations.find(s => s.id === record.serviceStationId);
  const stationName = (station?.name || record.garageName || '').trim();
  const isKcmStation = stationName.toLowerCase() === KCM_STATION_NAME;

  let invoiceNumber: string;
  if (isKcmStation) {
    invoiceNumber = nextInvoiceNumber(existingInvoices);
  } else {
    invoiceNumber = (record.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      throw new Error(`Enter an Invoice Number for ${stationName || 'this service station'} on the work order before generating - it's not auto-numbered since this isn't KCM Service Station.`);
    }
  }

  const vehicle = vehicles.find(v => regNoOf(v) === record.regNo.trim().toUpperCase());
  const totalAmount = record.workItems && record.workItems.length > 0
    ? record.workItems.reduce((s, w) => s + (w.cost || 0), 0)
    : (record.cost || 0);
  // Paid Amount is tracked on the invoice itself (edited from the invoice
  // modal, by Accounts, once payment is actually made) - not part of the
  // work order intake - so a regenerate must carry it forward rather than
  // resetting it back to zero.
  const priorInvoice = existingInvoices.find(i => i.maintenanceRecordId === record.id);

  const now = new Date();
  const invoice: ServiceInvoiceRecord = {
    id: record.id,
    maintenanceRecordId: record.id,
    invoiceNumber,
    isAutoNumbered: isKcmStation,
    regNo: record.regNo,
    workOrderDate: record.date,
    workOrderTime: record.time,
    vehicleModel: vehicle?.Model || vehicle?.model,
    vehicleOwnership: vehicle?.Ownership || vehicle?.ownership,
    odometer: record.odometer,
    garageName: stationName,
    serviceStationId: record.serviceStationId,
    workItems: record.workItems && record.workItems.length > 0 ? record.workItems : [{ description: record.description || '-', cost: record.cost || 0 }],
    totalAmount,
    paidAmount: priorInvoice?.paidAmount,
    nextServiceDueNote: nextServiceDueNote(record.regNo, vehicleServiceSchedules),
    generatedDate: now.toISOString().slice(0, 10),
    generatedTime: now.toTimeString().slice(0, 5)
  };

  // Render + store the PDF via the same generic upload endpoint every other
  // module's documents already use, so this invoice has a real,
  // re-fetchable pdfUrl rather than only ever existing as an in-memory
  // download.
  try {
    const file = buildServiceInvoiceFile(invoice);
    const formData = new FormData();
    formData.append('file', file);
    const uploadRes = await fetch('/api/upload/service-invoices', { method: 'POST', body: formData });
    const uploadResult = await uploadRes.json();
    if (uploadResult.success) invoice.pdfUrl = `/${uploadResult.path}`;
  } catch (err) {
    console.error('Failed to store generated service invoice PDF:', err);
    // Non-fatal - the invoice record still saves below without a stored PDF;
    // Download still works by re-rendering the PDF from this same snapshot.
  }

  const saveRes = await authFetch('/api/service-invoices', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invoice)
  });
  if (!saveRes.ok) {
    const body = await saveRes.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to save the generated invoice.');
  }

  const auditEntry: ServiceInvoiceAuditRecord = {
    id: `${invoiceNumber}-${forceRegenerate ? 'regen' : 'gen'}-${Date.now()}`,
    invoiceNumber, maintenanceRecordId: record.id, regNo: record.regNo,
    action: forceRegenerate ? 'Regenerated' : 'Generated',
    timestamp: new Date().toISOString(),
    performedBy
  };
  await authFetch('/api/service-invoice-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });

  return { invoice, isNew: true };
}

// Records a payment against an already-generated invoice (Accounts marking
// it paid/partially paid) - doesn't write an audit row of its own, since the
// Generated/Regenerated/Downloaded trail (confirmed with the user) is only
// about the document lifecycle, not payment tracking.
export async function updateInvoicePaidAmount(invoice: ServiceInvoiceRecord, paidAmount: number): Promise<ServiceInvoiceRecord> {
  const updated: ServiceInvoiceRecord = { ...invoice, paidAmount };
  const res = await authFetch(`/api/service-invoices/${invoice.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update the paid amount.');
  }
  return updated;
}

// Called when the Download button is actually clicked (not on generation) -
// updates isDownloaded/lastDownloadedDate and writes the 'Downloaded' audit
// row, same convention as the Salary Slip.
export async function markInvoiceDownloaded(invoice: ServiceInvoiceRecord, performedBy: string): Promise<void> {
  const updated: ServiceInvoiceRecord = { ...invoice, isDownloaded: true, lastDownloadedDate: new Date().toISOString().slice(0, 10) };
  await authFetch(`/api/service-invoices/${invoice.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
  });
  const auditEntry: ServiceInvoiceAuditRecord = {
    id: `${invoice.invoiceNumber}-download-${Date.now()}`,
    invoiceNumber: invoice.invoiceNumber, maintenanceRecordId: invoice.maintenanceRecordId, regNo: invoice.regNo,
    action: 'Downloaded', timestamp: new Date().toISOString(), performedBy
  };
  await authFetch('/api/service-invoice-audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditEntry)
  });
}
