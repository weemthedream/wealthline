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

// Schema setup runs once per cold start; every request waits for it to finish.
app.use(async (req, res, next) => {
  try {
    await ready;
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

app.get('/api/health', (req, res) => res.json({ ok: true }));

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
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
