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
    targetAmount: row.target_amount,
    targetDate: row.target_date,
    currentAmount: row.current_amount,
    monthlyContribution: row.monthly_contribution,
    expectedReturnPct: row.expected_return_pct
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await sql`SELECT * FROM goals WHERE user_id = ${req.userId}`;
    res.json(rows.map(mapRow));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, targetAmount, targetDate, currentAmount, monthlyContribution, expectedReturnPct } = req.body;
    if (!name || targetAmount === undefined || !targetDate) {
      return res.status(400).json({ error: 'name, targetAmount and targetDate are required' });
    }
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO goals (id, user_id, name, target_amount, target_date, current_amount, monthly_contribution, expected_return_pct)
      VALUES (
        ${id}, ${req.userId}, ${name}, ${Number(targetAmount)}, ${targetDate},
        ${Number(currentAmount) || 0}, ${Number(monthlyContribution) || 0},
        ${expectedReturnPct === undefined ? 6 : Number(expectedReturnPct)}
      )
    `;
    const [row] = await sql`SELECT * FROM goals WHERE id = ${id}`;
    res.status(201).json(mapRow(row));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const [row] = await sql`SELECT * FROM goals WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!row) return res.status(404).json({ error: 'Goal not found' });
    const next_ = {
      name: req.body.name !== undefined ? req.body.name : row.name,
      targetAmount: req.body.targetAmount !== undefined ? Number(req.body.targetAmount) : row.target_amount,
      targetDate: req.body.targetDate !== undefined ? req.body.targetDate : row.target_date,
      currentAmount: req.body.currentAmount !== undefined ? Number(req.body.currentAmount) : row.current_amount,
      monthlyContribution:
        req.body.monthlyContribution !== undefined ? Number(req.body.monthlyContribution) : row.monthly_contribution,
      expectedReturnPct:
        req.body.expectedReturnPct !== undefined ? Number(req.body.expectedReturnPct) : row.expected_return_pct
    };
    await sql`
      UPDATE goals
      SET name = ${next_.name}, target_amount = ${next_.targetAmount}, target_date = ${next_.targetDate},
          current_amount = ${next_.currentAmount}, monthly_contribution = ${next_.monthlyContribution},
          expected_return_pct = ${next_.expectedReturnPct}
      WHERE id = ${row.id}
    `;
    res.json({ id: row.id, ...next_ });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await sql`DELETE FROM goals WHERE id = ${req.params.id} AND user_id = ${req.userId} RETURNING id`;
    if (result.length === 0) return res.status(404).json({ error: 'Goal not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
