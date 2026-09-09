import React from 'react';

// Shared pagination footer (2026-09-09 direct request) - the exact same
// "Showing X to Y of Z entries" + Previous/Page N of M/Next bar Petty Cash's
// own Ledger already used, extracted into one reusable component so every
// module using it renders identical copy/behavior instead of a per-module
// reimplementation. Only rendered once there's more than one page (matches
// Petty Cash's own "shown once there's more than one page" convention).
interface PaginationFooterProps {
  page: number; // 1-indexed, not yet clamped - this component clamps internally
  totalCount: number; // count of the actual FILTERED result set, not the unfiltered total
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function PaginationFooter({ page, totalCount, pageSize, onPageChange }: PaginationFooterProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  if (totalPages <= 1) return null;

  const start = totalCount === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const end = Math.min(totalCount, clampedPage * pageSize);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-600">
      <div>
        Showing {start} to {end} of {totalCount} entries
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, clampedPage - 1))}
          disabled={clampedPage === 1}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          Previous
        </button>
        <span className="px-3 py-1.5 font-mono">
          Page {clampedPage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, clampedPage + 1))}
          disabled={clampedPage === totalPages}
          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// Slices `rows` down to the given 1-indexed page, clamping the page number
// into range first (so a stale page number - e.g. after a filter shrinks
// the result set - never returns an empty slice from "past the end").
export function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  return rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);
}
