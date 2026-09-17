const express = require('express');
const crypto = require('crypto');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isLiability: row.is_liability,
    balance: row.balance,
    color: row.color
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function upsertSnapshot(userId, accountId, date, balance) {
  const [existing] = await sql`SELECT id FROM account_snapshots WHERE account_id = ${accountId} AND date = ${date}`;
  if (existing) {
    await sql`UPDATE account_snapshots SET balance = ${balance} WHERE id = ${existing.id}`;
  } else {
    await sql`
      INSERT INTO account_snapshots (id, user_id, account_id, date, balance)
      VALUES (${crypto.randomUUID()}, ${userId}, ${accountId}, ${date}, ${balance})
    `;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM accounts WHERE user_id = ${req.userId} ORDER BY created_at`;
    res.json(rows.map(mapRow));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, type, isLiability, balance, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    const id = crypto.randomUUID();
    const numBalance = Number(balance) || 0;
    const finalColor = color || '#6366f1';
    await sql`
      INSERT INTO accounts (id, user_id, name, type, is_liability, balance, color)
      VALUES (${id}, ${req.userId}, ${name}, ${type}, ${!!isLiability}, ${numBalance}, ${finalColor})
    `;
    await upsertSnapshot(req.userId, id, today(), numBalance);
    res.status(201).json({ id, name, type, isLiability: !!isLiability, balance: numBalance, color: finalColor });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const [account] = await sql`SELECT * FROM accounts WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!account) return res.status(404).json({ error: 'Account not found' });
    const next_ = {
      name: req.body.name !== undefined ? req.body.name : account.name,
      type: req.body.type !== undefined ? req.body.type : account.type,
      isLiability: req.body.isLiability !== undefined ? !!req.body.isLiability : account.is_liability,
      balance: req.body.balance !== undefined ? Number(req.body.balance) : account.balance,
      color: req.body.color !== undefined ? req.body.color : account.color
    };
    await sql`
      UPDATE accounts SET name = ${next_.name}, type = ${next_.type}, is_liability = ${next_.isLiability}, balance = ${next_.balance}, color = ${next_.color}
      WHERE id = ${account.id}
    `;
    if (next_.balance !== account.balance) {
      await upsertSnapshot(req.userId, account.id, today(), next_.balance);
    }
    res.json({ id: account.id, ...next_ });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await sql`DELETE FROM accounts WHERE id = ${req.params.id} AND user_id = ${req.userId} RETURNING id`;
    if (result.length === 0) return res.status(404).json({ error: 'Account not found' });
    await sql`DELETE FROM account_snapshots WHERE account_id = ${req.params.id}`;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
