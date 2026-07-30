import Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage holds the active SQLite database connection for the current request
export const dbContext = new AsyncLocalStorage<Database.Database>();

export const dbAdapter = {
  prepare(sql: string) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritabanı bağlantısı bulunamadı.");
    }
    return activeDb.prepare(sql);
  },
  
  transaction(fn: any) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritabanı bağlantısı bulunamadı.");
    }
    const sqliteTx = activeDb.transaction(fn);
    return async (...args: any[]) => {
      return sqliteTx(...args);
    };
  },
  
  exec(sql: string) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritabanı bağlantısı bulunamadı.");
    }
    return activeDb.exec(sql);
  },
  
  pragma(sql: string) {
    const activeDb = dbContext.getStore();
    if (!activeDb) {
      throw new Error("Aktif veritabanı bağlantısı bulunamadı.");
    }
    return activeDb.pragma(sql);
  }
};

// Database schema initialization helper
export function initDbFile(dbInstance: Database.Database) {
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Users table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      api_key TEXT,
      model_provider TEXT DEFAULT 'gemini',
      local_endpoint TEXT DEFAULT 'http://localhost:1234/v1',
      model_name TEXT DEFAULT '',
      currency_api_key TEXT,
      gdrive_api_key TEXT,
      gdrive_folder_id TEXT
    );
  `);

  try {
    dbInstance.exec("ALTER TABLE users ADD COLUMN currency_api_key TEXT;");
  } catch (e) {}
  try {
    dbInstance.exec("ALTER TABLE users ADD COLUMN gdrive_api_key TEXT;");
  } catch (e) {}
  try {
    dbInstance.exec("ALTER TABLE users ADD COLUMN gdrive_folder_id TEXT;");
  } catch (e) {}

  // Accounts Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'TRY',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Financial Profiles
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS financial_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      monthly_income INTEGER DEFAULT 0,
      rent INTEGER DEFAULT 0,
      total_debt INTEGER DEFAULT 0,
      interest_rate INTEGER DEFAULT 0,
      min_payment_isbank INTEGER DEFAULT 0,
      min_payment_enpara INTEGER DEFAULT 0,
      debts_list TEXT DEFAULT '[]',
      rent_income INTEGER DEFAULT 0,
      ready_cash INTEGER DEFAULT 0
    );
  `);

  try {
    dbInstance.exec("ALTER TABLE financial_profiles ADD COLUMN rent_income INTEGER DEFAULT 0;");
  } catch (e) {}
  try {
    dbInstance.exec("ALTER TABLE financial_profiles ADD COLUMN ready_cash INTEGER DEFAULT 0;");
  } catch (e) {}

  // Expenses
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      essentials INTEGER DEFAULT 0,
      financial INTEGER DEFAULT 0,
      discretionary INTEGER DEFAULT 0,
      subscriptions INTEGER DEFAULT 0,
      installments INTEGER DEFAULT 0
    );
  `);

  // Chat History
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Credit Cards
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      bank_name TEXT NOT NULL,
      card_number_last4 TEXT NOT NULL,
      total_debt INTEGER DEFAULT 0,
      interest_rate INTEGER DEFAULT 0,
      minimum_payment INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'TRY',
      created_at DATETIME
    );
  `);

  try {
    dbInstance.exec("ALTER TABLE credit_cards ADD COLUMN currency TEXT DEFAULT 'TRY';");
  } catch (e) {}

  // Transactions
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      transaction_date TEXT,
      description TEXT,
      amount INTEGER,
      category TEXT,
      created_at DATETIME
    );
  `);

  // Draft Transactions
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS draft_transactions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      import_source TEXT,
      transaction_date TEXT,
      description TEXT,
      amount INTEGER,
      category TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ledger Transactions
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS ledger_transactions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      account_id TEXT,
      transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function toCents(lira: number | undefined | null): number {
  if (lira === undefined || lira === null) return 0;
  return Math.round(Number(lira) * 100);
}

export function toLira(cents: number | undefined | null): number {
  if (cents === undefined || cents === null) return 0;
  return Number(cents) / 100;
}

export default dbAdapter;
