const express = require('express');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentYear() {
  return new Date().getFullYear();
}

function sumBy(rows, type) {
  return rows.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
}

router.get('/', async (req, res, next) => {
  try {
    const month = req.query.month || currentMonth();
    const userId = req.userId;

    const categories = await sql`SELECT * FROM categories WHERE user_id = ${userId}`;
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

    const startMonth = shiftMonth(month, -5);
    const startDate = `${startMonth}-01`;
    const endDate = `${shiftMonth(month, 1)}-01`;
    const rangeTransactions = await sql`
      SELECT * FROM transactions WHERE user_id = ${userId} AND date >= ${startDate} AND date < ${endDate}
    `;

    const monthTransactions = rangeTransactions.filter((t) => t.date.startsWith(month));
    const income = sumBy(monthTransactions, 'income');
    const expenses = sumBy(monthTransactions, 'expense');

    const totalsByCategory = {};
    for (const t of monthTransactions) {
      totalsByCategory[t.category_id] = (totalsByCategory[t.category_id] || 0) + t.amount;
    }
    const byCategory = Object.entries(totalsByCategory)
      .map(([categoryId, total]) => {
        const cat = categoryById[categoryId];
        return {
          categoryId,
          name: cat ? cat.name : 'Unknown',
          color: cat ? cat.color : '#868e96',
          type: cat ? cat.type : 'expense',
          total
        };
      })
      .sort((a, b) => b.total - a.total);

    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(month, -i);
      const txs = rangeTransactions.filter((t) => t.date.startsWith(m));
      trend.push({ month: m, income: sumBy(txs, 'income'), expenses: sumBy(txs, 'expense') });
    }

    const budgets = await sql`SELECT * FROM budgets WHERE user_id = ${userId} AND month = ${month}`;
    const budgetProgress = budgets.map((b) => {
      const cat = categoryById[b.category_id];
      return {
        categoryId: b.category_id,
        name: cat ? cat.name : 'Unknown',
        color: cat ? cat.color : '#868e96',
        limit: b.limit_amount,
        spent: totalsByCategory[b.category_id] || 0
      };
    });

    res.json({ month, income, expenses, net: income - expenses, byCategory, trend, budgetProgress });
  } catch (err) {
    next(err);
  }
});

router.get('/year', async (req, res, next) => {
  try {
    const year = Number(req.query.year) || currentYear();
    const userId = req.userId;
    const yearPrefix = String(year);

    const categories = await sql`SELECT * FROM categories WHERE user_id = ${userId}`;
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

    const rangeStart = `${year - 1}-01-01`;
    const rangeEnd = `${year + 1}-01-01`;
    const rangeTransactions = await sql`
      SELECT * FROM transactions WHERE user_id = ${userId} AND date >= ${rangeStart} AND date < ${rangeEnd}
    `;

    const yearTransactions = rangeTransactions.filter((t) => t.date.startsWith(yearPrefix));
    const income = sumBy(yearTransactions, 'income');
    const expenses = sumBy(yearTransactions, 'expense');

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, '0')}`;
      const txs = yearTransactions.filter((t) => t.date.startsWith(monthKey));
      months.push({ month: monthKey, income: sumBy(txs, 'income'), expenses: sumBy(txs, 'expense') });
    }

    const totalsByCategory = {};
    for (const t of yearTransactions) {
      totalsByCategory[t.category_id] = (totalsByCategory[t.category_id] || 0) + t.amount;
    }
    const byCategory = Object.entries(totalsByCategory)
      .map(([categoryId, total]) => {
        const cat = categoryById[categoryId];
        return {
          categoryId,
          name: cat ? cat.name : 'Unknown',
          color: cat ? cat.color : '#868e96',
          type: cat ? cat.type : 'expense',
          total
        };
      })
      .sort((a, b) => b.total - a.total);

    const yearBudgets = await sql`SELECT * FROM budgets WHERE user_id = ${userId} AND month LIKE ${yearPrefix + '%'}`;
    const budgetsByCategory = {};
    for (const b of yearBudgets) {
      if (!budgetsByCategory[b.category_id]) budgetsByCategory[b.category_id] = { limit: 0, spent: 0 };
      budgetsByCategory[b.category_id].limit += b.limit_amount;
      const monthTxs = yearTransactions.filter((t) => t.date.startsWith(b.month) && t.category_id === b.category_id);
      budgetsByCategory[b.category_id].spent += monthTxs.reduce((s, t) => s + t.amount, 0);
    }
    const budgetAdherence = Object.entries(budgetsByCategory).map(([categoryId, v]) => {
      const cat = categoryById[categoryId];
      return {
        categoryId,
        name: cat ? cat.name : 'Unknown',
        color: cat ? cat.color : '#868e96',
        limit: v.limit,
        spent: v.spent
      };
    });

    const prevYearTransactions = rangeTransactions.filter((t) => t.date.startsWith(String(year - 1)));
    let yoy = null;
    if (prevYearTransactions.length > 0) {
      const prevIncome = sumBy(prevYearTransactions, 'income');
      const prevExpenses = sumBy(prevYearTransactions, 'expense');
      yoy = {
        incomeChangePct: prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : null,
        expensesChangePct: prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : null
      };
    }

    res.json({
      year,
      income,
      expenses,
      net: income - expenses,
      savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0,
      months,
      byCategory,
      budgetAdherence,
      yoy
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
