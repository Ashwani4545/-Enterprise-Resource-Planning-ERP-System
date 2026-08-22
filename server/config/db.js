const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// SQLite database file location
const dbPath = path.join(__dirname, '..', 'erp_system.db');

// Create SQLite connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');
  }
});

/**
 * Run a query with automatic client release.
 * Mimics PostgreSQL pool.query() interface for compatibility.
 * @param {string} text - SQL query text (convert PostgreSQL $1, $2... to ?)
 * @param {Array} params - query parameters
 */
async function query(text, params = []) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    // Convert PostgreSQL placeholders ($1, $2...) to SQLite placeholders (?)
    let sqliteText = text;
    const matches = text.match(/\$\d+/g);
    if (matches) {
      sqliteText = text.replace(/\$\d+/g, '?');
    }

    if (text.trim().toUpperCase().startsWith('SELECT')) {
      db.all(sqliteText, params, (err, rows) => {
        if (err) {
          console.error('Query error:', err.message);
          reject(err);
        } else {
          if (process.env.NODE_ENV === 'development') {
            const duration = Date.now() - start;
            console.log('executed query', { text: text.substring(0, 80), duration, rows: rows ? rows.length : 0 });
          }
          resolve({
            rows: rows || [],
            rowCount: rows ? rows.length : 0,
          });
        }
      });
    } else {
      // INSERT, UPDATE, DELETE
      db.run(sqliteText, params, function(err) {
        if (err) {
          console.error('Query error:', err.message);
          reject(err);
        } else {
          if (process.env.NODE_ENV === 'development') {
            const duration = Date.now() - start;
            console.log('executed query', { text: text.substring(0, 80), duration, rowCount: this.changes });
          }
          resolve({
            rows: [],
            rowCount: this.changes,
            lastID: this.lastID,
          });
        }
      });
    }
  });
}

/**
 * Get a client for manual transaction control.
 */
async function getClient() {
  return {
    query: query,
    release: async () => {},
  };
}

module.exports = { pool: db, query, getClient };
