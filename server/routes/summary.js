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

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Auto-generated spending callouts: biggest category swings vs. last month,
// early over-budget-pace warnings, and wins worth noticing.
// Wording is deliberately neutral (state the fact, not a judgment) and each
// insight carries a `kind` so the UI can offer the matching next step.
function buildInsights({ month, byCategory, prevByCategory, budgetProgress, income, prevIncome, expenses, prevExpenses }) {
  const insights = [];
  const prevTotals = Object.fromEntries(prevByCategory.map((c) => [c.categoryId, c.total]));

  const swings = byCategory
    .filter((c) => c.type === 'expense')
    .map((c) => {
      const prev = prevTotals[c.categoryId] || 0;
      const delta = c.total - prev;
      const pct = prev > 0 ? (delta / prev) * 100 : null;
      return { ...c, prev, delta, pct };
    })
    .filter((c) => c.prev >= 20 && c.pct !== null && Math.abs(c.pct) >= 20)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2);

  for (const s of swings) {
    insights.push({
      type: s.delta > 0 ? 'warning' : 'positive',
      kind: 'swing',
      categoryId: s.categoryId,
      text:
        s.delta > 0
          ? `${s.name} is up ${Math.round(s.pct)}% from last month ($${Math.round(s.delta)} more).`
          : `${s.name} is down ${Math.round(Math.abs(s.pct))}% from last month ($${Math.round(Math.abs(s.delta))} less).`
    });
  }

  const now = new Date();
  const isCurrentMonth = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (isCurrentMonth) {
    const dayOfMonth = now.getDate();
    const totalDays = daysInMonth(month);
    const expectedPace = dayOfMonth / totalDays;
    const daysLeft = totalDays - dayOfMonth;
    const dayWord = daysLeft === 1 ? 'day' : 'days';
    let onTrack = 0;
    let tracked = 0;
    for (const b of budgetProgress) {
      if (b.limit <= 0) continue;
      tracked++;
      const pctUsed = b.spent / b.limit;
      if (pctUsed > 1) {
        insights.push({
          type: 'danger',
          kind: 'budget-over',
          categoryId: b.categoryId,
          text: `${b.name} is $${Math.round(b.spent - b.limit)} over its $${Math.round(b.limit)} budget, with ${daysLeft} ${dayWord} left.`
        });
      } else if (pctUsed > expectedPace * 1.3 && pctUsed > 0.5) {
        insights.push({
          type: 'warning',
          kind: 'budget-pace',
          categoryId: b.categoryId,
          text: `${b.name} has used ${Math.round(pctUsed * 100)}% of its budget, ${Math.round(expectedPace * 100)}% of the way through the month.`
        });
      } else if (pctUsed <= expectedPace) {
        onTrack++;
      }
    }
    if (onTrack > 0) {
      insights.push({
        type: 'positive',
        kind: 'win',
        text:
          onTrack === tracked
            ? `Every budget is on pace this month. Nice work.`
            : `${onTrack} of ${tracked} budgets ${onTrack === 1 ? 'is' : 'are'} on pace this month.`
      });
    }
  }

  if (insights.length === 0 && prevIncome !== undefined) {
    if (prevExpenses > 0) {
      const pct = ((expenses - prevExpenses) / prevExpenses) * 100;
      if (Math.abs(pct) >= 10) {
        insights.push({
          type: pct > 0 ? 'warning' : 'positive',
          kind: 'swing',
          text: `Overall spending is ${pct > 0 ? 'up' : 'down'} ${Math.round(Math.abs(pct))}% from last month.`
        });
      }
    }
    if (income > 0 && expenses > 0 && income - expenses > 0) {
      insights.push({ type: 'positive', kind: 'win', text: `You're on pace to save $${Math.round(income - expenses)} this month.` });
    }
  }

  const rank = { danger: 0, warning: 1, positive: 2 };
  const sorted = insights.sort((a, b) => rank[a.type] - rank[b.type]);
  const win = sorted.find((i) => i.kind === 'win');
  const top = sorted.filter((i) => i !== win).slice(0, win ? 3 : 4);
  return win ? [...top, win] : top;
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

    const prevMonth = shiftMonth(month, -1);
    const prevTransactions = rangeTransactions.filter((t) => t.date.startsWith(prevMonth));
    const prevTotalsByCategory = {};
    for (const t of prevTransactions) {
      prevTotalsByCategory[t.category_id] = (prevTotalsByCategory[t.category_id] || 0) + t.amount;
    }
    const prevByCategory = Object.entries(prevTotalsByCategory).map(([categoryId, total]) => {
      const cat = categoryById[categoryId];
      return { categoryId, type: cat ? cat.type : 'expense', total };
    });
    const insights = buildInsights({
      month,
      byCategory,
      prevByCategory,
      budgetProgress,
      income,
      prevIncome: sumBy(prevTransactions, 'income'),
      expenses,
      prevExpenses: sumBy(prevTransactions, 'expense')
    });

    res.json({ month, income, expenses, net: income - expenses, byCategory, trend, budgetProgress, insights });
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

// Weekly recap: the last full Monday–Sunday week, compared with the week
// before it. The client sends its local date so "last week" matches the
// user's calendar rather than the server's time zone.
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

router.get('/week', async (req, res, next) => {
  try {
    const userId = req.userId;
    const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.today || '') ? req.query.today : new Date().toISOString().slice(0, 10);
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const thisMonday = addDays(today, -dow);
    const weekStart = addDays(thisMonday, -7);
    const weekEnd = addDays(thisMonday, -1);
    const prevStart = addDays(weekStart, -7);

    const categories = await sql`SELECT * FROM categories WHERE user_id = ${userId}`;
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
    const txs = await sql`
      SELECT * FROM transactions WHERE user_id = ${userId} AND date >= ${prevStart} AND date <= ${weekEnd}
    `;
    const week = txs.filter((t) => t.date >= weekStart);
    const prev = txs.filter((t) => t.date < weekStart);

    const spendByCat = (rows) => {
      const out = {};
      for (const t of rows) if (t.type === 'expense') out[t.category_id] = (out[t.category_id] || 0) + t.amount;
      return out;
    };
    const cur = spendByCat(week);
    const before = spendByCat(prev);
    const catInfo = (id) => ({
      categoryId: id,
      name: categoryById[id] ? categoryById[id].name : 'Unknown',
      color: categoryById[id] ? categoryById[id].color : '#868e96'
    });

    const topCategories = Object.entries(cur)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, total]) => ({ ...catInfo(id), total }));

    // Only compare when there is a previous week to compare with.
    const hasPrev = prev.length > 0;
    let biggestMove = null;
    if (hasPrev) {
      const ids = new Set([...Object.keys(cur), ...Object.keys(before)]);
      for (const id of ids) {
        const delta = (cur[id] || 0) - (before[id] || 0);
        if (Math.abs(delta) >= 10 && (!biggestMove || Math.abs(delta) > Math.abs(biggestMove.delta))) {
          biggestMove = { ...catInfo(id), delta };
        }
      }
    }

    const expenses = week.filter((t) => t.type === 'expense');
    const largest = expenses.sort((a, b) => b.amount - a.amount)[0];

    res.json({
      weekStart,
      weekEnd,
      count: week.length,
      spent: sumBy(week, 'expense'),
      income: sumBy(week, 'income'),
      prevSpent: hasPrev ? sumBy(prev, 'expense') : null,
      topCategories,
      biggestMove,
      largestPurchase: largest
        ? { description: largest.description, amount: largest.amount, date: largest.date, ...catInfo(largest.category_id) }
        : null
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
