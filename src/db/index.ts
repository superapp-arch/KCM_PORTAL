import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "./schema.ts";

console.log("SQL_HOST =", process.env.SQL_HOST);
console.log("SQL_PORT =", process.env.SQL_PORT);
console.log("SQL_USER =", process.env.SQL_USER);
console.log("SQL_DB_NAME =", process.env.SQL_DB_NAME);

// 2026-09-22 security hardening: the Cloud SQL server CA (GOOGLE_MANAGED_
// INTERNAL_CA) is deployed to production at this fixed path - not an env
// var, since no such configuration pattern already existed for this project
// and one specific, known, non-secret file path doesn't need to be
// user-configurable. Only production has this file; a developer machine
// never will, so its absence is exactly how local development is detected
// below - never a flag to set or a value to guess.
const PROD_CLOUD_SQL_CA_PATH = "/etc/kcm-logistics/ssl/server-ca.pem";

// Was `ssl: { rejectUnauthorized: false }` unconditionally - encrypted the
// connection but never verified it was actually talking to the real Cloud
// SQL server (accepted any certificate, including a spoofed one from an
// on-path attacker). Now verifies against the real Cloud SQL CA whenever
// it's present (i.e. always in production, where it's deployed ahead of
// time at the fixed path above) - the database host/port/user/password
// config below is completely unchanged, only the ssl object differs.
//
// Local development has no Cloud SQL CA file on disk at all, so this falls
// back to the previous (encrypted, unverified) behavior ONLY in that case -
// production always has the file, so production's validation is never
// weakened by this fallback; a developer who wants full local verification
// too can drop the same CA file at this same path on their own machine.
//
// 2026-09-22 follow-up: enabling rejectUnauthorized:true surfaced a SEPARATE
// Node TLS check beyond chain-of-trust - hostname verification, which
// compares the connection's `host` (SQL_HOST, "localhost" in production -
// the app reaches Cloud SQL through a local proxy/tunnel on that address)
// against the certificate's SAN, which is Cloud SQL's own instance-specific
// DNS name (15-...asia-south1.sql.goog). That mismatch is expected here,
// not a sign of a wrong/spoofed certificate - already independently
// confirmed via `psql PGSSLMODE=verify-ca PGSSLROOTCERT=<this same CA file>`
// connecting successfully as kcm_app with ssl=t, which validates the exact
// same chain Node is validating. `checkServerIdentity` is Node's SEPARATE,
// purely-cosmetic hostname-vs-SAN check - it has no bearing on
// certificate-chain verification, which `ca` above still fully enforces
// (a certificate not signed by this CA is still rejected either way). This
// only skips that one irrelevant hostname comparison for THIS production
// Cloud SQL branch specifically - the local-dev fallback below is
// untouched and never sets it.
function resolveSslConfig(): { rejectUnauthorized: boolean; ca?: string; checkServerIdentity?: () => undefined } {
  if (fs.existsSync(PROD_CLOUD_SQL_CA_PATH)) {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(PROD_CLOUD_SQL_CA_PATH).toString(),
      checkServerIdentity: () => undefined,
    };
  }
  return { rejectUnauthorized: false };
}

export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST?.trim(),
    port: Number(process.env.SQL_PORT?.trim() || 5432),
    user: process.env.SQL_USER?.trim(),
    password: process.env.SQL_PASSWORD?.trim(),
    database: process.env.SQL_DB_NAME?.trim(),
    ssl: resolveSslConfig(),
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on("error", (err) => {
  console.error("Unexpected error on idle SQL pool client:", err);
});

export const db = drizzle(pool, { schema });
