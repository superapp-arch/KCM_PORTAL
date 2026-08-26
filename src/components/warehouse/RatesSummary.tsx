import React from 'react';
import { BadgeInfo } from 'lucide-react';
import {
  RATE_TABLES, RATE_MATRIX_KM_SLABS, RATE_MATRIX_VEHICLE_TYPES, RateTableKey,
  lookupExtraRates
} from '../../utils/warehouseRateMatrix';
import {
  DEDICATED_24HR_TABLES, REEFER_WALKES_TABLE, ADHOC_ROUTES, ADHOC_VEHICLE_COLUMNS,
  ADHOC_DAILY_TABLES
} from '../../utils/warehouseRateMatrix24hr';
import { formatINR } from '../../utils/warehouseRates';

// Read-only "see every current rate at a glance" screen - the actual pain
// point being fixed is that none of the rate cards driving Log Warehouse
// Deployment's auto-fills were ever visible anywhere in the app; office
// staff had no way to check a rate without asking whoever has the source
// spreadsheet. This reads directly from the same tables that already drive
// those auto-fills (utils/warehouseRateMatrix.ts and
// warehouseRateMatrix24hr.ts) - it's a view onto that data, not a second
// copy of it, so it can never drift out of sync with what Log Deployment
// actually uses.
//
// Deliberately NOT editable yet (see the module's own build-scope decision)
// - adding/editing rates through this screen, with the deployment form
// reading from a live database table instead of these code-level tables, is
// a separate follow-up.

const GROUP_DISPLAY_LABELS: Record<RateTableKey, string> = {
  blr: 'BLR - ECOM, IM1, IM2, IM3, IM4 & DHL',
  ecomHyd: 'ECOM HYD - IM1, IM2, IM3',
  vizag: 'Vizag',
  hydIm4: 'HYD IM4',
};
const GROUP_ORDER: RateTableKey[] = ['blr', 'ecomHyd', 'vizag', 'hydIm4'];

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {subtitle && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{subtitle}</p>}
    </div>
  );
}

function PendingNote({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold mt-2">
      <BadgeInfo className="w-3 h-3 shrink-0" /> {text}
    </p>
  );
}

export default function RatesSummary() {
  return (
    <div className="space-y-8">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-[11px] text-amber-800">
        <BadgeInfo className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Read-only view of every rate currently used to auto-fill Log Warehouse Deployment.
          BLR, Vizag and HYD IM4 24Hr Dedicated are loaded, plus BLR and HYD IM4's Daily/Local Ad-hoc rates;
          the 12Hr table's Extra Km/Extra Hr rates and ECOM HYD (IM1-3)'s 24Hr/Ad-hoc rates are still pending.
        </span>
      </div>

      {/* 1. 12Hr Dedicated Vehicle Cost, per Warehouse Group */}
      <section>
        <SectionHeading title="12Hr Dedicated Vehicle Cost" subtitle="Scheduled Rate by Vehicle Type x Km Slab; Extra Km/Hr Rate by Vehicle Type" />
        <div className="space-y-5">
          {GROUP_ORDER.map(groupKey => {
            const table = RATE_TABLES[groupKey];
            const rows = RATE_MATRIX_VEHICLE_TYPES.filter(vt => table[vt]);
            if (rows.length === 0) return null;
            const hasExtraRates = groupKey === 'blr';
            return (
              <div key={groupKey} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 px-3 py-2">
                  <span className="text-purple-100 font-extrabold uppercase tracking-wide text-[11px]">{GROUP_DISPLAY_LABELS[groupKey]}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9.5px] tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Vehicle Type</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Fixed Hr</th>
                        {RATE_MATRIX_KM_SLABS.map(slab => <th key={slab} className="px-3 py-2 text-right">Sch. Rate @ {slab} km</th>)}
                        <th className="px-3 py-2 text-right">Extra Km Rate</th>
                        <th className="px-3 py-2 text-right">Extra Hr Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(vt => {
                        const row = table[vt]!;
                        const extra = hasExtraRates ? lookupExtraRates(groupKey, vt) : null;
                        return (
                          <tr key={vt} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{vt}</td>
                            <td className="px-3 py-2 text-slate-500">Dry</td>
                            <td className="px-3 py-2 text-slate-500">12</td>
                            {RATE_MATRIX_KM_SLABS.map(slab => <td key={slab} className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row[slab])}</td>)}
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{extra ? formatINR(extra.extraKm) : <span className="text-slate-300">—</span>}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{extra ? formatINR(extra.extraHr) : <span className="text-slate-300">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!hasExtraRates && <div className="px-3 pb-2"><PendingNote text="Extra Km/Extra Hr rates not yet provided for this group." /></div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 24Hr Dedicated - one card per configured warehouse group */}
      <section>
        <SectionHeading title="24Hr Dedicated Vehicle Cost" subtitle="Fixed/Variable by Vehicle Type - effective 1st Feb" />
        <div className="space-y-5">
          {Object.entries(DEDICATED_24HR_TABLES).map(([groupLabel, table]) => {
            const rows = RATE_MATRIX_VEHICLE_TYPES.filter(vt => table[vt]);
            if (rows.length === 0) return null;
            return (
              <div key={groupLabel} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 px-3 py-2">
                  <span className="text-purple-100 font-extrabold uppercase tracking-wide text-[11px]">{groupLabel} Dedicated</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9.5px] tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Vehicle Type</th>
                        <th className="px-3 py-2 text-right">Fixed</th>
                        <th className="px-3 py-2 text-right">Variable (₹/km)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(vt => {
                        const row = table[vt]!;
                        return (
                          <tr key={vt} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{vt}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.fixed)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.variable)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length < RATE_MATRIX_VEHICLE_TYPES.length && (
                  <div className="px-3 pb-2"><PendingNote text={`Only ${rows.join(', ')} configured for ${groupLabel} so far - other vehicle types pending.`} /></div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 24Hr Reefer & Walkes */}
      <section>
        <SectionHeading title="24Hr Reefer & Walkes" subtitle="Monthly FC (Fixed Cost) / VC (Variable Cost) by Location + Vehicle - effective 1st Jul'26" />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[9.5px] tracking-wide">
                <tr>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2 text-right">FC</th>
                  <th className="px-3 py-2 text-right">VC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(Object.entries(REEFER_WALKES_TABLE) as [string, Record<string, { fc: number; vc: number }>][]).flatMap(([location, vehicles]) =>
                  Object.entries(vehicles).map(([vehicle, row]) => (
                    <tr key={`${location}-${vehicle}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{location}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{vehicle}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.fc)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.vc)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. Ad-hoc - Route table */}
      <section>
        <SectionHeading title="24Hr Ad-hoc - Route Rates" subtitle="Flat round-trip rate by From City → To City → Vehicle" />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-purple-100 uppercase text-[9.5px] tracking-wide">
                <tr>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  {ADHOC_VEHICLE_COLUMNS.map(col => <th key={col} className="px-3 py-2 text-right whitespace-nowrap">{col}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ADHOC_ROUTES.map(route => (
                  <tr key={`${route.from}-${route.to}`} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{route.from}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{route.to}</td>
                    {ADHOC_VEHICLE_COLUMNS.map(col => (
                      <td key={col} className="px-3 py-2 text-right font-mono text-slate-700">
                        {route.rates[col] > 0 ? formatINR(route.rates[col]) : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 pb-2"><PendingNote text="— means no rate configured for that route/vehicle combination." /></div>
        </div>
      </section>

      {/* 5. Ad-hoc - Daily/Local rate table - one card per configured group */}
      <section>
        <SectionHeading title="24Hr Ad-hoc - Daily/Local Rates" subtitle="Per-vehicle-type day rate (Kms/Hrs included) + Extra Km/Hr overage - a separate Ad-hoc pricing model from the Route table above, for local use with no fixed route. Effective 1st Feb." />
        <div className="space-y-5">
          {Object.entries(ADHOC_DAILY_TABLES).map(([groupLabel, table]) => {
            const rows = RATE_MATRIX_VEHICLE_TYPES.filter(vt => table[vt]);
            if (rows.length === 0) return null;
            return (
              <div key={groupLabel} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 px-3 py-2">
                  <span className="text-purple-100 font-extrabold uppercase tracking-wide text-[11px]">{groupLabel}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[9.5px] tracking-wide">
                      <tr>
                        <th className="px-3 py-2">Vehicle Type</th>
                        <th className="px-3 py-2 text-right">Daily Kms</th>
                        <th className="px-3 py-2 text-right">Hrs</th>
                        <th className="px-3 py-2 text-right">Ad Hoc Rate</th>
                        <th className="px-3 py-2 text-right">Extra Km</th>
                        <th className="px-3 py-2 text-right">Extra Hr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(vt => {
                        const row = table[vt]!;
                        return (
                          <tr key={vt} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{vt}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{row.dailyKms}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{row.hrs}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.rate)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.extraKm)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{formatINR(row.extraHr)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <PendingNote text="Not yet wired into the Add/Edit Entry form - Ad-hoc there still only offers the Route table above." />
        </div>
      </section>
    </div>
  );
}
