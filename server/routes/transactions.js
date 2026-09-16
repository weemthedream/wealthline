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

module.exports = router;
