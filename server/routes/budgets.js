const express = require('express');
const crypto = require('crypto');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function mapRow(row) {
  return { id: row.id, categoryId: row.category_id, month: row.month, limit: row.limit_amount };
}

router.get('/', async (req, res, next) => {
  try {
    let rows;
    if (req.query.month) {
      rows = await sql`SELECT * FROM budgets WHERE user_id = ${req.userId} AND month = ${req.query.month}`;
    } else {
      rows = await sql`SELECT * FROM budgets WHERE user_id = ${req.userId}`;
    }
    res.json(rows.map(mapRow));
  } catch (err) {
    next(err);
  }
});

// Upsert: one budget per (user, category, month)
router.post('/', async (req, res, next) => {
  try {
    const { categoryId, month, limit } = req.body;
    if (!categoryId || !month || limit === undefined) {
      return res.status(400).json({ error: 'categoryId, month and limit are required' });
    }
    const numLimit = Number(limit);
    const [existing] = await sql`
      SELECT * FROM budgets WHERE user_id = ${req.userId} AND category_id = ${categoryId} AND month = ${month}
    `;
    if (existing) {
      await sql`UPDATE budgets SET limit_amount = ${numLimit} WHERE id = ${existing.id}`;
      return res.status(201).json({ id: existing.id, categoryId, month, limit: numLimit });
    }
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO budgets (id, user_id, category_id, month, limit_amount)
      VALUES (${id}, ${req.userId}, ${categoryId}, ${month}, ${numLimit})
    `;
    res.status(201).json({ id, categoryId, month, limit: numLimit });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await sql`DELETE FROM budgets WHERE id = ${req.params.id} AND user_id = ${req.userId} RETURNING id`;
    if (result.length === 0) return res.status(404).json({ error: 'Budget not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
