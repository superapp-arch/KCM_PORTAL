// Idempotent seed for the vehicle_maintenance_reference table (see
// src/db/schema.ts) from data/vehicle_responsible_only.csv - re-running this
// is always safe, it just upserts the same 228 rows again by vehicle_no
// (the primary key), never duplicating or erroring on a second run.
//
// Usage: node scripts/seedVehicleMaintenanceReference.mjs
import 'dotenv/config';
import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '..', 'data', 'vehicle_responsible_only.csv');

// Minimal CSV parser - good enough for this fixed, comma-only, no-quoted-
// commas dataset (Responsible names use "/" not "," so a plain split is
// safe here; not a general-purpose CSV parser).
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function toIntOrUndefined(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  const client = new Client({
    host: process.env.SQL_HOST, port: process.env.SQL_PORT, user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD, database: process.env.SQL_DB_NAME, ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  let upserted = 0;
  try {
    for (const row of rows) {
      const vehicleNo = (row['Vehicle No'] || '').trim().toUpperCase();
      if (!vehicleNo) continue;
      const responsible = row['Responsible']?.trim() || null;
      const lastServiceDoneKm = toIntOrUndefined(row['Last Service Done KM']) ?? null;
      const warrantyPeriod = row['Warranty Period']?.trim() || null;
      const servicePeriod = toIntOrUndefined(row['Service Period']) ?? null;

      await client.query(
        `INSERT INTO vehicle_maintenance_reference (vehicle_no, responsible, last_service_done_km, warranty_period, service_period, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (vehicle_no) DO UPDATE SET
           responsible = EXCLUDED.responsible,
           last_service_done_km = EXCLUDED.last_service_done_km,
           warranty_period = EXCLUDED.warranty_period,
           service_period = EXCLUDED.service_period,
           updated_at = EXCLUDED.updated_at`,
        [vehicleNo, responsible, lastServiceDoneKm, warrantyPeriod, servicePeriod, new Date().toISOString()]
      );
      upserted++;
    }
    console.log(`Upserted ${upserted} vehicle_maintenance_reference rows.`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Seed failed:', err); process.exitCode = 1; });
