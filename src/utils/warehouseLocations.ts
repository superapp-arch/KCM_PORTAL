// Known Warehouse Name -> Warehouse City pairs, shared by WarehouseDetails.tsx
// (the Warehouse Name datalist + auto-filled Warehouse City field) and the
// 24Hr rate-matrix lookups in warehouseRateMatrix24hr.ts, which need the same
// name -> city resolution to key the Reefer/Walkes FC/VC table by location.
// Both Warehouse Name fields in the form stay plain text inputs with a
// datalist (not a locked-down <select>), so a brand-new warehouse not in this
// list can always be typed in manually - selecting/typing an exact match here
// just auto-fetches its city; it doesn't restrict entry to only these names.
export const WAREHOUSE_LOCATIONS: { name: string; city: string }[] = [
  { name: 'BLR DHL', city: 'Bangalore' },
  { name: 'BLR ECOM2', city: 'Bangalore' },
  { name: 'BLR IM1', city: 'Bangalore' },
  { name: 'BLR IM2', city: 'Bangalore' },
  { name: 'BLR IM3', city: 'Bangalore' },
  { name: 'BLR IM4', city: 'Bangalore' },
  { name: 'CHN COLD IM1', city: 'Chennai' },
  { name: 'GOA IM1', city: 'Central Goa' },
  { name: 'Goravegere Cold WH', city: 'Bangalore' },
  { name: 'HYD IM1', city: 'Hyderabad' },
  { name: 'HYD IM2', city: 'Hyderabad' },
  { name: 'HYD IM3 -Cold Star', city: 'Hyderabad' },
  { name: 'HYD IM4', city: 'Hyderabad' },
  { name: 'HYD IM5', city: 'Hyderabad' },
  { name: 'VIZ IM1', city: 'Vizag' },
];
export const WAREHOUSE_CITIES = Array.from(new Set(WAREHOUSE_LOCATIONS.map(w => w.city)));
export const cityForWarehouseName = (name: string): string | undefined =>
  WAREHOUSE_LOCATIONS.find(w => w.name.trim().toLowerCase() === name.trim().toLowerCase())?.city;
