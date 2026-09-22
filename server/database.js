const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required (a Postgres connection string, e.g. from Neon).');
}

const sql = neon(process.env.DATABASE_URL);

// Neon suspends idle computes (scale to zero). The first query after a suspend
// can fail at the socket level while the compute wakes, so transient connection
// errors get a short backoff rather than failing the request outright.
function isTransient(err) {
  const text = `${err?.message || ''} ${err?.sourceError?.message || ''} ${err?.sourceError?.cause?.code || ''}`;
  return /fetch failed|other side closed|UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|EAI_AGAIN|503|502/i.test(text);
}

async function withRetry(fn, { attempts = 4, baseDelayMs = 250 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransient(err) || attempt === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastError;
}

async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reset_token_hash TEXT,
      reset_token_expires TIMESTAMPTZ
    )
  `;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ`;
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      category_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      limit_amount DOUBLE PRECISION NOT NULL,
      UNIQUE(user_id, category_id, month)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      due_day INTEGER NOT NULL,
      category_id TEXT,
      frequency TEXT NOT NULL DEFAULT 'monthly',
      active BOOLEAN NOT NULL DEFAULT true,
      paid_months TEXT NOT NULL DEFAULT '[]'
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_amount DOUBLE PRECISION NOT NULL,
      target_date TEXT NOT NULL,
      current_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
      monthly_contribution DOUBLE PRECISION NOT NULL DEFAULT 0,
      expected_return_pct DOUBLE PRECISION NOT NULL DEFAULT 6
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      is_liability BOOLEAN NOT NULL DEFAULT false,
      balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS account_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      balance DOUBLE PRECISION NOT NULL,
      UNIQUE(account_id, date)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_account_snapshots_user ON account_snapshots(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_account_snapshots_account ON account_snapshots(account_id, date)`;
}

// Schema setup runs once per cold start. A rejected promise is deliberately NOT
// cached: caching one would poison every later request on this warm instance,
// so a single cold-start blip would take the whole app down until it recycled.
let schemaPromise = null;

function ready() {
  if (!schemaPromise) {
    schemaPromise = withRetry(createSchema).catch((err) => {
      schemaPromise = null; // let the next request try again
      throw err;
    });
  }
  return schemaPromise;
}

// Expense colours follow the validated categorical slot order so a new user's
// spending chart is CVD-safe and legible on both the light and dark surfaces.
const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', color: '#199e70' },
  { name: 'Freelance', type: 'income', color: '#1baf7a' },
  { name: 'Other Income', type: 'income', color: '#008300' },
  { name: 'Groceries', type: 'expense', color: '#3987e5' },
  { name: 'Rent', type: 'expense', color: '#d95926' },
  { name: 'Utilities', type: 'expense', color: '#199e70' },
  { name: 'Transport', type: 'expense', color: '#c98500' },
  { name: 'Dining Out', type: 'expense', color: '#d55181' },
  { name: 'Entertainment', type: 'expense', color: '#9085e9' },
  { name: 'Other', type: 'expense', color: '#71717a' }
];

async function seedDefaultCategories(userId) {
  for (const cat of DEFAULT_CATEGORIES) {
    await sql`
      INSERT INTO categories (id, user_id, name, type, color)
      VALUES (${crypto.randomUUID()}, ${userId}, ${cat.name}, ${cat.type}, ${cat.color})
    `;
  }
}

module.exports = { sql, ready, seedDefaultCategories, withRetry };
