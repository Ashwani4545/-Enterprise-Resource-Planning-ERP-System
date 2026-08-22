const { Pool } = require('pg');
require('dotenv').config();

// Use a single connection string if provided, otherwise fall back to discrete params.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'erp_system',
      user: process.env.DB_USER || 'erp_user',
      password: process.env.DB_PASSWORD || 'erp_password',
    });

pool.on('error', (err) => {
  // Unexpected errors on idle clients should not crash the whole process silently.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Run a query with automatic client release.
 * @param {string} text - SQL query text
 * @param {Array} params - query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    const duration = Date.now() - start;
    console.log('executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Get a client for manual transaction control (BEGIN/COMMIT/ROLLBACK).
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

module.exports = { pool, query, getClient };
