/**
 * Orion Build Cost - Database Layer (Phase 6 & 8)
 * High-performance, zero-dependency persistent SQLite storage via node:sqlite.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.ORION_DB_PATH || path.join(DATA_DIR, 'orion.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode, busy timeout, and foreign key constraints for integrity and performance
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 10000;
  PRAGMA foreign_keys = ON;
`);

/**
 * Initialize / Migrate Database Schema
 */
function initializeDatabase() {
  db.exec(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client', -- 'client' or 'admin'
      full_name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Sessions Table
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Password Reset Tokens
    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Organisations
    CREATE TABLE IF NOT EXISTS organisations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reg_number TEXT,
      vat_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 5. Customer Profiles
    CREATE TABLE IF NOT EXISTS customer_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      address TEXT,
      postcode TEXT,
      billing_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. Projects
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      project_type TEXT NOT NULL,
      location TEXT,
      postcode TEXT,
      floor_area REAL DEFAULT 0,
      spec_tier TEXT DEFAULT 'premium',
      status TEXT DEFAULT 'draft', -- 'draft', 'estimating', 'quoted', 'active', 'completed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. Estimates
    CREATE TABLE IF NOT EXISTS estimates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subtotal REAL NOT NULL,
      contingency_rate REAL NOT NULL,
      contingency_amount REAL NOT NULL,
      net_total REAL NOT NULL,
      vat_rate REAL NOT NULL,
      vat_amount REAL NOT NULL,
      grand_total REAL NOT NULL,
      spec_tier TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. Estimate Line Items
    CREATE TABLE IF NOT EXISTS estimate_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      item_no TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_rate REAL NOT NULL,
      total REAL NOT NULL
    );

    -- 9. Quotes & Revisions
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_ref TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT DEFAULT 'new', -- 'new', 'under_review', 'awaiting_information', 'quote_preparation', 'quote_sent', 'accepted', 'declined', 'completed'
      scope TEXT NOT NULL,
      deadline TEXT,
      approx_size TEXT,
      internal_notes TEXT, -- NEVER exposed to clients
      revision_number INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Enquiries (From Website Public Form)
    CREATE TABLE IF NOT EXISTS enquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      project_type TEXT,
      country TEXT,
      postcode TEXT,
      services TEXT,
      description TEXT,
      status TEXT DEFAULT 'new',
      internal_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. File Metadata
    CREATE TABLE IF NOT EXISTS file_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Document Exports Audit
    CREATE TABLE IF NOT EXISTS document_exports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id INTEGER REFERENCES estimates(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      export_type TEXT NOT NULL, -- 'xlsx', 'csv', 'pdf'
      file_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. Activity & Audit Logs
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 14. Construction Pricing Records (Phase 8)
    CREATE TABLE IF NOT EXISTS pricing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_category TEXT NOT NULL,
      item_code TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_rate REAL NOT NULL,
      currency TEXT DEFAULT 'GBP',
      labour_element REAL DEFAULT 0,
      materials_element REAL DEFAULT 0,
      plant_element REAL DEFAULT 0,
      geographic_coverage TEXT DEFAULT 'UK-Nationwide',
      effective_date TEXT NOT NULL,
      expiry_date TEXT,
      source_reference TEXT NOT NULL,
      verification_status TEXT DEFAULT 'illustrative', -- 'verified', 'illustrative', 'unverified', 'expired'
      vat_treatment TEXT DEFAULT 'standard-20',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 15. Drawing Annotations & Assisted Take-Offs (Phase 9)
    CREATE TABLE IF NOT EXISTS drawing_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER REFERENCES file_metadata(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      page_number INTEGER DEFAULT 1,
      tool_type TEXT NOT NULL, -- 'linear', 'area', 'count'
      label TEXT NOT NULL,
      measured_value REAL NOT NULL,
      unit TEXT NOT NULL,
      scale_ratio TEXT DEFAULT '1:100',
      provenance TEXT DEFAULT 'manual', -- 'manual', 'ai_suggested', 'verified_approved'
      notes TEXT,
      coordinates_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create Indices for High-Speed Lookups
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_estimates_user ON estimates(user_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_ref ON quotes(quote_ref);
    CREATE INDEX IF NOT EXISTS idx_enquiries_ref ON enquiries(reference);
    CREATE INDEX IF NOT EXISTS idx_pricing_trade ON pricing_records(trade_category);
    CREATE INDEX IF NOT EXISTS idx_annotations_file ON drawing_annotations(file_id);
  `);
}

// Run schema initialization
initializeDatabase();

module.exports = {
  db,
  initializeDatabase
};
