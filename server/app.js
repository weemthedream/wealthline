const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const { ready } = require('./database');
const authRouter = require('./routes/auth');
const categoriesRouter = require('./routes/categories');
const transactionsRouter = require('./routes/transactions');
const budgetsRouter = require('./routes/budgets');
const billsRouter = require('./routes/bills');
const summaryRouter = require('./routes/summary');
const goalsRouter = require('./routes/goals');
const accountsRouter = require('./routes/accounts');
const networthRouter = require('./routes/networth');

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

// Liveness check — deliberately above the schema gate so it still answers when
// the database is unreachable.
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/health/db', async (req, res) => {
  try {
    await ready();
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    res.status(503).json({ ok: false, database: 'unreachable', error: err.message });
  }
});

// Schema setup runs once per cold start; data routes wait for it to finish.
app.use('/api', async (req, res, next) => {
  try {
    await ready();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/bills', billsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/networth', networthRouter);

// In production (self-hosted / Docker), serve the built frontend from the same
// server so the app works as a single deployable unit. On Vercel the frontend
// is served separately by the static build, so this is a no-op there.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const text = `${err?.message || ''} ${err?.sourceError?.message || ''}`;
  if (/fetch failed|other side closed|connecting to database|ECONNRESET|ETIMEDOUT/i.test(text)) {
    return res.status(503).json({ error: 'The database is waking up. Please try again in a moment.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
