const express = require('express');
const crypto = require('crypto');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

async function usageCounts(userId, categoryId) {
  const [tx] = await sql`SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = ${userId} AND category_id = ${categoryId}`;
  const [bd] = await sql`SELECT COUNT(*)::int AS n FROM budgets WHERE user_id = ${userId} AND category_id = ${categoryId}`;
  const [bl] = await sql`SELECT COUNT(*)::int AS n FROM bills WHERE user_id = ${userId} AND category_id = ${categoryId}`;
  return { transactions: tx.n, budgets: bd.n, bills: bl.n };
}

router.get('/', async (req, res, next) => {
  try {
    const categories = await sql`
      SELECT id, name, type, color FROM categories WHERE user_id = ${req.userId} ORDER BY created_at
    `;
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/usage', async (req, res, next) => {
  try {
    const [category] = await sql`SELECT id FROM categories WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(await usageCounts(req.userId, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, type, color } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    const id = crypto.randomUUID();
    const finalColor = color || '#64748b';
    await sql`INSERT INTO categories (id, user_id, name, type, color) VALUES (${id}, ${req.userId}, ${name}, ${type}, ${finalColor})`;
    res.status(201).json({ id, name, type, color: finalColor });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const [category] = await sql`SELECT * FROM categories WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!category) return res.status(404).json({ error: 'Category not found' });
    const name = req.body.name !== undefined ? req.body.name : category.name;
    const color = req.body.color !== undefined ? req.body.color : category.color;
    await sql`UPDATE categories SET name = ${name}, color = ${color} WHERE id = ${category.id}`;
    res.json({ id: category.id, name, type: category.type, color });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [category] = await sql`SELECT * FROM categories WHERE id = ${req.params.id} AND user_id = ${req.userId}`;
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const counts = await usageCounts(req.userId, category.id);
    const inUse = counts.transactions + counts.budgets + counts.bills > 0;
    const reassignTo = req.query.reassignTo;

    if (inUse) {
      if (!reassignTo) return res.status(409).json({ error: 'Category is in use', counts });
      const [target] = await sql`SELECT id FROM categories WHERE id = ${reassignTo} AND user_id = ${req.userId}`;
      if (!target || target.id === category.id) return res.status(400).json({ error: 'Invalid reassignment category' });

      await sql`UPDATE transactions SET category_id = ${reassignTo} WHERE user_id = ${req.userId} AND category_id = ${category.id}`;
      await sql`UPDATE bills SET category_id = ${reassignTo} WHERE user_id = ${req.userId} AND category_id = ${category.id}`;

      // Avoid a duplicate (user, category, month) budget after reassignment.
      const existingBudgets = await sql`SELECT * FROM budgets WHERE user_id = ${req.userId} AND category_id = ${category.id}`;
      for (const b of existingBudgets) {
        const [dup] = await sql`
          SELECT id FROM budgets WHERE user_id = ${req.userId} AND category_id = ${reassignTo} AND month = ${b.month}
        `;
        if (dup) {
          await sql`DELETE FROM budgets WHERE id = ${b.id}`;
        } else {
          await sql`UPDATE budgets SET category_id = ${reassignTo} WHERE id = ${b.id}`;
        }
      }
    }

    await sql`DELETE FROM categories WHERE id = ${category.id}`;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
