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

export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST?.trim(),
    port: Number(process.env.SQL_PORT?.trim() || 5432),
    user: process.env.SQL_USER?.trim(),
    password: process.env.SQL_PASSWORD?.trim(),
    database: process.env.SQL_DB_NAME?.trim(),
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on("error", (err) => {
  console.error("Unexpected error on idle SQL pool client:", err);
});

export const db = drizzle(pool, { schema });
