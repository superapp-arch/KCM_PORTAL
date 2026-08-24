import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, Lock, Search, Download, Eye, X, ChevronLeft, ChevronRight,
  ArrowUpDown, RotateCcw, FileSpreadsheet, FileText
} from 'lucide-react';
import { User as UserType, AuditLog, AuditAction } from '../types';
import { authFetch } from '../authFetch';
import { exportReportToExcel, exportReportToPdf } from '../utils/reportExport';

interface AuditTrailProps {
  user: UserType;
}

const ACTIONS: AuditAction[] = [
  'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT',
  'EXPORT', 'IMPORT', 'PASSWORD_CHANGE', 'ROLE_CHANGE', 'ACCESS_DENIED', 'OTHER'
];

const ACTION_STYLES: Record<string, string> = {
  LOGIN: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOGOUT: 'bg-slate-100 text-slate-600 border-slate-200',
  CREATE: 'bg-sky-50 text-sky-700 border-sky-200',
  UPDATE: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
  APPROVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECT: 'bg-rose-50 text-rose-700 border-rose-200',
  EXPORT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  IMPORT: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PASSWORD_CHANGE: 'bg-purple-50 text-purple-700 border-purple-200',
  ROLE_CHANGE: 'bg-purple-50 text-purple-700 border-purple-200',
  ACCESS_DENIED: 'bg-rose-100 text-rose-800 border-rose-300',
  OTHER: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface Filters {
  dateFrom: string; dateTo: string; userId: string; userRole: string;
  module: string; action: string; entityType: string; q: string;
}
const EMPTY_FILTERS: Filters = { dateFrom: '', dateTo: '', userId: '', userRole: '', module: '', action: '', entityType: '', q: '' };

const PAGE_SIZE = 25;
const AUDIT_EXPORT_COLUMNS = ['Date & Time', 'User', 'Role', 'Module', 'Action', 'Entity', 'Entity ID', 'Description', 'IP Address'];

function buildAuditQuery(f: Filters, page: number, sortDir: 'asc' | 'desc', pageSize: number): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  params.set('sortDir', sortDir);
  if (f.dateFrom) params.set('dateFrom', f.dateFrom);
  if (f.dateTo) params.set('dateTo', f.dateTo);
  if (f.userId) params.set('userId', f.userId);
  if (f.userRole) params.set('userRole', f.userRole);
  if (f.module) params.set('module', f.module);
  if (f.action) params.set('action', f.action);
  if (f.entityType) params.set('entityType', f.entityType);
  if (f.q) params.set('q', f.q);
  return params.toString();
}

const auditExportRow = (log: AuditLog): (string | number)[] => [
  log.createdAt, log.userName || log.userId || '-', log.userRole || '-', log.module,
  log.action, log.entityType || '-', log.entityId || '-', log.description, log.ipAddress || '-'
];

export default function AuditTrail({ user }: AuditTrailProps) {
  // Defense-in-depth: Administration.tsx already gates rendering this
  // component to Super Admin only (same hasAccess() pattern every other
  // module uses - Principal's own account is department 'super_admin' too,
  // see server.ts's requireAuditAccess comment), but this internal check
  // means Audit Trail refuses to show anything even if it were ever reached
  // another way - the same belt-and-suspenders Reports.tsx already uses.
  // The server independently re-checks this on every /api/audit-logs*
  // request regardless of what this component does.
  const isSuperAdmin = user.department === 'super_admin';

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // Applied only on Search/Enter/Clear - not on every keystroke - so typing
  // in the keyword box doesn't fire a request per character.
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsLog, setDetailsLog] = useState<AuditLog | null>(null);
  const [filterOptions, setFilterOptions] = useState<{ users: { userId: string; userName: string }[]; modules: string[]; actions: string[]; entityTypes: string[] }>({ users: [], modules: [], actions: [], entityTypes: [] });
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    authFetch('/api/audit-logs/filter-options').then(r => r.json()).then(setFilterOptions).catch(() => {});
  }, [isSuperAdmin]);

  const load = useCallback(() => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setError(null);
    authFetch(`/api/audit-logs?${buildAuditQuery(appliedFilters, page, sortDir, PAGE_SIZE)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setRows(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(() => setError('Failed to load audit logs.'))
      .finally(() => setLoading(false));
  }, [isSuperAdmin, appliedFilters, page, sortDir]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => { setAppliedFilters(filters); setPage(1); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); setPage(1); };
  const toggleSort = () => { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); setPage(1); };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Pulls up to MAX_AUDIT_PAGE_SIZE (server-capped, see getAuditLogs)
  // matching rows regardless of what's on the current page, so the export
  // reflects the filters, not just what's currently on screen.
  const handleExport = async (format: 'excel' | 'pdf') => {
    setIsExporting(format);
    try {
      const res = await authFetch(`/api/audit-logs?${buildAuditQuery(appliedFilters, 1, sortDir, 2000)}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      const list: AuditLog[] = data.data || [];
      const section = { heading: 'Audit Trail', columns: AUDIT_EXPORT_COLUMNS, rows: list.map(auditExportRow) };
      const filename = `KCM_Audit_Trail_${new Date().toISOString().slice(0, 10)}`;
      if (format === 'excel') {
        exportReportToExcel(filename, [section]);
      } else {
        exportReportToPdf(filename, 'Audit Trail', `${list.length} of ${data.total} matching record${data.total === 1 ? '' : 's'}`, [section]);
      }
    } catch {
      setError('Failed to export audit logs.');
    } finally {
      setIsExporting(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-10 text-center">
        <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <h2 className="text-sm font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">Audit Trail is limited to Super Admin / Principal logins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="audit-trail-view-wrapper">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 font-sans flex items-center gap-2">
            <ShieldAlert className="text-rose-600 w-5 h-5" />
            Audit Trail
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Read-only security &amp; activity log - Super Admin / Principal only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('excel')} disabled={isExporting !== null} className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-3 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> {isExporting === 'excel' ? 'Exporting…' : 'Excel'}
          </button>
          <button onClick={() => handleExport('pdf')} disabled={isExporting !== null} className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold px-3 py-2 rounded-lg uppercase text-[11px] flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50">
            <FileText className="w-3.5 h-3.5 text-rose-600" /> {isExporting === 'pdf' ? 'Exporting…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Date From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Date To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">User</label>
            <select value={filters.userId} onChange={e => setFilters(f => ({ ...f, userId: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="">All Users</option>
              {filterOptions.users.map(u => <option key={u.userId} value={u.userId}>{u.userName} ({u.userId})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Role</label>
            <input value={filters.userRole} onChange={e => setFilters(f => ({ ...f, userRole: e.target.value }))} placeholder="e.g. super_admin" autoComplete="off" className="w-full border border-slate-300 rounded-lg px-2 py-1.5" />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Module</label>
            <select value={filters.module} onChange={e => setFilters(f => ({ ...f, module: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="">All Modules</option>
              {filterOptions.modules.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Action</label>
            <select value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="">All Actions</option>
              {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Entity Type</label>
            <select value={filters.entityType} onChange={e => setFilters(f => ({ ...f, entityType: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5">
              <option value="">All Entities</option>
              {filterOptions.entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-1 uppercase tracking-wide">Keyword</label>
            <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} onKeyDown={e => e.key === 'Enter' && applyFilters()} placeholder="Description, user, entity ID…" autoComplete="off" className="flex-1 outline-none min-w-0" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={applyFilters} className="bg-gradient-to-r from-pink-600 to-purple-700 hover:shadow-md text-white font-bold px-4 py-1.5 rounded-lg uppercase text-[10px] cursor-pointer transition-all">
            Search
          </button>
          <button onClick={clearFilters} className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-lg uppercase text-[10px] flex items-center gap-1 cursor-pointer transition-all">
            <RotateCcw className="w-3 h-3" /> Clear
          </button>
          <button onClick={toggleSort} className="ml-auto bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold px-3 py-1.5 rounded-lg uppercase text-[10px] flex items-center gap-1 cursor-pointer transition-all">
            <ArrowUpDown className="w-3 h-3" /> {sortDir === 'desc' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-800">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-3 py-2.5 whitespace-nowrap">Date &amp; Time</th>
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Module</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Entity</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">IP Address</th>
                <th className="px-3 py-2.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400">No audit records match these filters.</td></tr>
              ) : rows.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{log.createdAt}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{log.userName || log.userId || 'Unknown'}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{log.userRole || '-'}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{log.module}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full border text-[9.5px] font-bold ${ACTION_STYLES[log.action] || ACTION_STYLES.OTHER}`}>{log.action}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{log.entityType ? `${log.entityType}${log.entityId ? ` #${log.entityId}` : ''}` : '-'}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[320px] truncate" title={log.description}>{log.description}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-400 whitespace-nowrap">{log.ipAddress || '-'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => setDetailsLog(log)} title="View Details" className="p-1 text-slate-400 hover:text-purple-700 hover:bg-slate-100 rounded cursor-pointer">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-[11px] text-slate-500">
          <span>{total === 0 ? '0 records' : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total.toLocaleString('en-IN')} records`}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="font-semibold">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {detailsLog && <AuditDetailsModal log={detailsLog} onClose={() => setDetailsLog(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details modal - basic info, plus a readable data-changes view instead of
// raw JSON: only changed fields for UPDATE (with Previous -> New per field),
// the created snapshot for CREATE, the pre-deletion snapshot for DELETE.
// ---------------------------------------------------------------------------

const prettyFieldName = (key: string): string =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

const formatValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
};

// Skips empty/null/undefined fields so the Created/Deleted snapshot tables
// stay focused on fields that actually carried a value, rather than a long
// list of blanks.
function flattenNonEmpty(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, unknown> = {};
  Object.entries(obj as Record<string, unknown>).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') return;
    out[k] = v;
  });
  return out;
}

function computeChangedFields(oldObj: unknown, newObj: unknown): { field: string; oldValue: string; newValue: string }[] {
  const oldFlat = flattenNonEmpty(oldObj);
  const newFlat = flattenNonEmpty(newObj);
  const keys = Array.from(new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])).sort();
  return keys
    .filter(k => formatValue(oldFlat[k]) !== formatValue(newFlat[k]))
    .map(k => ({ field: prettyFieldName(k), oldValue: formatValue(oldFlat[k]), newValue: formatValue(newFlat[k]) }));
}

function safeParse(json: string | undefined): unknown {
  if (!json) return undefined;
  try { return JSON.parse(json); } catch { return undefined; }
}

function AuditDetailsModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const oldObj = safeParse(log.oldData);
  const newObj = safeParse(log.newData);
  const isUpdate = log.action === 'UPDATE' && oldObj !== undefined && newObj !== undefined;
  const changedFields = isUpdate ? computeChangedFields(oldObj, newObj) : [];
  const snapshotObj = log.action === 'DELETE' ? oldObj : newObj;
  const snapshotLabel = log.action === 'DELETE' ? 'Data Before Deletion' : 'Data';
  const snapshotFields = !isUpdate ? Object.entries(flattenNonEmpty(snapshotObj)) : [];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-300" /> Audit Record Details
          </h3>
          <button onClick={onClose} className="text-purple-200 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 text-xs">
          {/* Basic information */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 bg-slate-50 rounded-xl border border-slate-200 p-4">
            <InfoRow label="User" value={log.userName || log.userId || 'Unknown'} />
            <InfoRow label="Role" value={log.userRole || '-'} />
            <InfoRow label="Date & Time" value={log.createdAt} />
            <InfoRow label="Module" value={log.module} />
            <InfoRow label="Action" value={<span className={`inline-block px-2 py-0.5 rounded-full border text-[9.5px] font-bold ${ACTION_STYLES[log.action] || ACTION_STYLES.OTHER}`}>{log.action}</span>} />
            <InfoRow label="Entity" value={log.entityType || '-'} />
            <InfoRow label="Entity ID" value={log.entityId || '-'} />
            <InfoRow label="IP Address" value={log.ipAddress || '-'} mono />
            <div className="col-span-2">
              <InfoRow label="User Agent" value={log.userAgent || '-'} mono />
            </div>
            <div className="col-span-2">
              <InfoRow label="Description" value={log.description} />
            </div>
          </div>

          {/* Data changes */}
          {isUpdate && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Data Changes</h4>
              {changedFields.length === 0 ? (
                <p className="text-slate-400 italic">No field-level differences recorded.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[9.5px] uppercase text-slate-500 tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Field</th>
                        <th className="px-3 py-2">Previous Value</th>
                        <th className="px-3 py-2"></th>
                        <th className="px-3 py-2">New Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {changedFields.map(f => (
                        <tr key={f.field}>
                          <td className="px-3 py-2 font-semibold text-slate-600 align-top whitespace-nowrap">{f.field}</td>
                          <td className="px-3 py-2 align-top"><span className="bg-rose-50 text-rose-700 border border-rose-200 rounded px-1.5 py-0.5 break-all">{f.oldValue}</span></td>
                          <td className="px-1 py-2 text-slate-300 align-top">→</td>
                          <td className="px-3 py-2 align-top"><span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 break-all">{f.newValue}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isUpdate && snapshotObj !== undefined && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">{snapshotLabel}</h4>
              {snapshotFields.length === 0 ? (
                <p className="text-slate-400 italic">No data recorded for this event.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-100">
                      {snapshotFields.map(([k, v]) => (
                        <tr key={k}>
                          <td className="px-3 py-2 font-semibold text-slate-600 align-top whitespace-nowrap w-1/3">{prettyFieldName(k)}</td>
                          <td className="px-3 py-2 text-slate-700 align-top break-all">{formatValue(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isUpdate && snapshotObj === undefined && log.action !== 'LOGIN' && log.action !== 'LOGOUT' && (
            <p className="text-slate-400 italic">No data snapshot recorded for this event.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`text-slate-800 ${mono ? 'font-mono' : ''} break-words`}>{value}</span>
    </div>
  );
}
