import React from 'react';
import kcmLogo from '../assets/images/logo.png';

interface DocumentHeaderProps {
  // The logo already carries the "KCM Logistics" wordmark, so there's no
  // separate title line here - subtitle is whatever distinguishes THIS
  // document (e.g. "Salary Slip - September 2026" or "Service Invoice").
  subtitle: string;
  className?: string;
}

// Shared on-screen preview header for every generated document (HR &
// Payroll's Salary Slip, Driver Details' own Salary Slip, Fleet
// Maintenance's Service Invoice) - one place so a future branding/logo
// change only ever needs to happen here. The actual downloaded/printed PDF
// draws the same logo separately via utils/documentPdfHeader.ts (a browser
// <img> can't be reused inside a jsPDF document), kept in sync by hand but
// both read from this same asset file so they can never show two different
// logos.
export default function DocumentHeader({ subtitle, className }: DocumentHeaderProps) {
  return (
    <div className={`text-center border-b border-slate-200 pb-3 ${className || ''}`}>
      <img src={kcmLogo} alt="KCM Logistics" className="h-12 mx-auto mb-1" />
      <p className="text-slate-500">{subtitle}</p>
    </div>
  );
}
