const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required (a Postgres connection string, e.g. from Neon).');
}

const sql = neon(process.env.DATABASE_URL);

// Idempotent schema setup, run once per cold start and awaited before any request is handled.
const ready = (async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
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
  await sql`CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id)`;
})();

const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'income', color: '#22c55e' },
  { name: 'Freelance', type: 'income', color: '#4ade80' },
  { name: 'Other Income', type: 'income', color: '#86efac' },
  { name: 'Groceries', type: 'expense', color: '#fb923c' },
  { name: 'Rent', type: 'expense', color: '#f43f5e' },
  { name: 'Utilities', type: 'expense', color: '#3b82f6' },
  { name: 'Transport', type: 'expense', color: '#8b5cf6' },
  { name: 'Dining Out', type: 'expense', color: '#ec4899' },
  { name: 'Entertainment', type: 'expense', color: '#f59e0b' },
  { name: 'Other', type: 'expense', color: '#64748b' }
];

async function seedDefaultCategories(userId) {
  for (const cat of DEFAULT_CATEGORIES) {
    await sql`
      INSERT INTO categories (id, user_id, name, type, color)
      VALUES (${crypto.randomUUID()}, ${userId}, ${cat.name}, ${cat.type}, ${cat.color})
    `;
  }
}

module.exports = { sql, ready, seedDefaultCategories };
