/**
 * Simple migration runner: executes schema.sql against the configured database.
 * Usage: npm run migrate
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Running migration...');
  try {
    await pool.query(sql);
    console.log('✅ Migration complete. Tables and seed roles are in place.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
