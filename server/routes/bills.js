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
    amount: row.amount,
    dueDay: row.due_day,
    categoryId: row.category_id,
    frequency: row.frequency,
    active: !!row.active,
    paidMonths: JSON.parse(row.paid_months || '[]')
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM bills WHERE user_id = ${req.userId}`;
    res.json(rows.map(mapRow));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, amount, dueDay, categoryId, frequency } = req.body;
    if (!name || amount === undefined || !dueDay) {
      return res.status(400).json({ error: 'name, amount and dueDay are required' });
    }
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO bills (id, user_id, name, amount, due_day, category_id, frequency, active, paid_months)
      VALUES (${id}, ${req.userId}, ${name}, ${Number(amount)}, ${Number(dueDay)}, ${categoryId || null}, ${frequency || 'monthly'}, true, '[]')
    `;
    const [row] = await sql`SELECT * FROM bills WHERE id = ${id}`;
    res.status(201).json(mapRow(row));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const [row] = await sql`SELECT * FROM bills WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!row) return res.status(404).json({ error: 'Bill not found' });
    const next_ = {
      name: req.body.name !== undefined ? req.body.name : row.name,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : row.amount,
      dueDay: req.body.dueDay !== undefined ? Number(req.body.dueDay) : row.due_day,
      categoryId: req.body.categoryId !== undefined ? req.body.categoryId : row.category_id,
      frequency: req.body.frequency !== undefined ? req.body.frequency : row.frequency,
      active: req.body.active !== undefined ? !!req.body.active : row.active
    };
    await sql`
      UPDATE bills
      SET name = ${next_.name}, amount = ${next_.amount}, due_day = ${next_.dueDay}, category_id = ${next_.categoryId}, frequency = ${next_.frequency}, active = ${next_.active}
      WHERE id = ${row.id}
    `;
    const [updated] = await sql`SELECT * FROM bills WHERE id = ${row.id}`;
    res.json(mapRow(updated));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/toggle-paid', async (req, res, next) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'month is required' });
    const [row] = await sql`SELECT * FROM bills WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!row) return res.status(404).json({ error: 'Bill not found' });
    const paidMonths = JSON.parse(row.paid_months || '[]');
    const idx = paidMonths.indexOf(month);
    if (idx >= 0) paidMonths.splice(idx, 1);
    else paidMonths.push(month);
    await sql`UPDATE bills SET paid_months = ${JSON.stringify(paidMonths)} WHERE id = ${row.id}`;
    const [updated] = await sql`SELECT * FROM bills WHERE id = ${row.id}`;
    res.json(mapRow(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await sql`DELETE FROM bills WHERE id = ${req.params.id} AND user_id = ${req.userId} RETURNING id`;
    if (result.length === 0) return res.status(404).json({ error: 'Bill not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
