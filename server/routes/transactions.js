const express = require('express');
const crypto = require('crypto');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function mapRow(row) {
  return {
    id: row.id,
    date: row.date,
    amount: row.amount,
    categoryId: row.category_id,
    type: row.type,
    description: row.description
  };
}

router.get('/', async (req, res, next) => {
  try {
    let rows;
    if (req.query.month) {
      rows = await sql`
        SELECT * FROM transactions WHERE user_id = ${req.userId} AND date LIKE ${req.query.month + '%'} ORDER BY date DESC
      `;
    } else {
      rows = await sql`SELECT * FROM transactions WHERE user_id = ${req.userId} ORDER BY date DESC`;
    }
    res.json(rows.map(mapRow));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { date, amount, categoryId, type, description } = req.body;
    if (!date || amount === undefined || !categoryId || !type) {
      return res.status(400).json({ error: 'date, amount, categoryId and type are required' });
    }
    const id = crypto.randomUUID();
    const numAmount = Number(amount);
    await sql`
      INSERT INTO transactions (id, user_id, date, amount, category_id, type, description)
      VALUES (${id}, ${req.userId}, ${date}, ${numAmount}, ${categoryId}, ${type}, ${description || ''})
    `;
    res.status(201).json({ id, date, amount: numAmount, categoryId, type, description: description || '' });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const [row] = await sql`SELECT * FROM transactions WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!row) return res.status(404).json({ error: 'Transaction not found' });
    const next_ = {
      date: req.body.date !== undefined ? req.body.date : row.date,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : row.amount,
      categoryId: req.body.categoryId !== undefined ? req.body.categoryId : row.category_id,
      type: req.body.type !== undefined ? req.body.type : row.type,
      description: req.body.description !== undefined ? req.body.description : row.description
    };
    await sql`
      UPDATE transactions
      SET date = ${next_.date}, amount = ${next_.amount}, category_id = ${next_.categoryId}, type = ${next_.type}, description = ${next_.description}
      WHERE id = ${row.id}
    `;
    res.json({ id: row.id, ...next_ });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await sql`DELETE FROM transactions WHERE id = ${req.params.id} AND user_id = ${req.userId} RETURNING id`;
    if (result.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const fingerprint = (t) =>
  [t.date, Number(t.amount).toFixed(2), t.type, (t.description || '').trim().toLowerCase()].join('|');

// Bulk import from a bank/credit-card CSV. Re-importing an overlapping export is
// the normal case, so anything matching an existing row on date + amount + type +
// description is skipped rather than duplicated.
router.post('/import', async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.transactions) ? req.body.transactions : null;
    if (!incoming || incoming.length === 0) {
      return res.status(400).json({ error: 'No transactions supplied' });
    }
    if (incoming.length > 2000) {
      return res.status(413).json({ error: 'Too many rows in one import — split the file (2000 max).' });
    }

    const validCategories = new Set(
      (await sql`SELECT id FROM categories WHERE user_id = ${req.userId}`).map((c) => c.id)
    );

    const dates = incoming.map((t) => t.date).filter(Boolean).sort();
    const existing = await sql`
      SELECT date, amount, type, description FROM transactions
      WHERE user_id = ${req.userId} AND date >= ${dates[0]} AND date <= ${dates[dates.length - 1]}
    `;
    const seen = new Set(existing.map(fingerprint));

    const rows = [];
    let skipped = 0;
    const errors = [];

    incoming.forEach((t, i) => {
      const amount = Number(t.amount);
      if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !isFinite(amount)) {
        errors.push(`Row ${i + 1}: missing or malformed date/amount`);
        return;
      }
      if (!validCategories.has(t.categoryId)) {
        errors.push(`Row ${i + 1}: unknown category`);
        return;
      }
      const type = t.type === 'income' ? 'income' : 'expense';
      const candidate = { date: t.date, amount: Math.abs(amount), type, description: (t.description || '').slice(0, 300) };
      const fp = fingerprint(candidate);
      if (seen.has(fp)) {
        skipped++;
        return;
      }
      seen.add(fp);
      rows.push({ ...candidate, categoryId: t.categoryId });
    });

    for (const r of rows) {
      await sql`
        INSERT INTO transactions (id, user_id, date, amount, category_id, type, description)
        VALUES (${crypto.randomUUID()}, ${req.userId}, ${r.date}, ${r.amount}, ${r.categoryId}, ${r.type}, ${r.description})
      `;
    }

    res.status(201).json({ imported: rows.length, skipped, errors });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
