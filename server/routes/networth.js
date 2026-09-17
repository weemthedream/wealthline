const express = require('express');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId;
    const accounts = await sql`SELECT * FROM accounts WHERE user_id = ${userId} ORDER BY created_at`;
    const snapshots = await sql`
      SELECT * FROM account_snapshots WHERE user_id = ${userId} ORDER BY date ASC
    `;

    const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));
    const totalAssets = accounts.filter((a) => !a.is_liability).reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = accounts.filter((a) => a.is_liability).reduce((s, a) => s + a.balance, 0);

    // Build a running net-worth history: replay snapshots in date order, tracking
    // each account's latest known balance, and record a history point per date.
    const snapshotsByDate = {};
    for (const s of snapshots) {
      if (!snapshotsByDate[s.date]) snapshotsByDate[s.date] = [];
      snapshotsByDate[s.date].push(s);
    }
    const dates = Object.keys(snapshotsByDate).sort();
    const knownBalances = {};
    const history = dates.map((date) => {
      for (const s of snapshotsByDate[date]) {
        knownBalances[s.account_id] = s.balance;
      }
      let assets = 0;
      let liabilities = 0;
      for (const [accountId, balance] of Object.entries(knownBalances)) {
        const account = accountById[accountId];
        if (!account) continue; // account was deleted since
        if (account.is_liability) liabilities += balance;
        else assets += balance;
      }
      return { date, assets, liabilities, netWorth: assets - liabilities };
    });

    res.json({
      netWorth: totalAssets - totalLiabilities,
      totalAssets,
      totalLiabilities,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        isLiability: a.is_liability,
        balance: a.balance,
        color: a.color
      })),
      history
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
