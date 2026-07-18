import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  host: process.env.SQL_HOST,
  port: Number(process.env.SQL_PORT || 5432),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

try {
  const client = await pool.connect();
  const res = await client.query('SELECT count(*) AS count FROM users');
  console.log('OK', res.rows);
  client.release();
} catch (err) {
  console.error('ERR', err);
  process.exit(1);
} finally {
  await pool.end();
}
