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

const PROD_CLOUD_SQL_CA_PATH = "/etc/kcm-logistics/ssl/server-ca.pem";

// Production Cloud SQL TLS configuration.
// The connection uses the database IP for routing, while TLS verification
// uses the hostname present in the Cloud SQL server certificate.
function resolveSslConfig(): {
  rejectUnauthorized: boolean;
  ca?: string;
  servername?: string;
} {
  if (fs.existsSync(PROD_CLOUD_SQL_CA_PATH)) {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(PROD_CLOUD_SQL_CA_PATH).toString(),
      servername:
        "15-0eeb5870-db94-4a47-b5a3-88e9561357e2.asia-south1.sql.goog",
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
