const express = require('express');
const ExcelJS = require('exceljs');
const { sql } = require('../database');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const PERCENT = '0.0"%"';
const DATE = 'yyyy-mm-dd';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

function styleSheet(ws, { freeze = 1, filter = true } = {}) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  if (freeze) ws.views = [{ state: 'frozen', ySplit: freeze }];
  if (filter && ws.columnCount > 0 && ws.rowCount > 1) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
}

// Built in UTC on purpose: parsing "2026-10-18T00:00:00" uses the server's
// local zone, which on a positive-offset host lands on the previous day once
// Excel renders it.
function excelDate(isoDay) {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const monthKey = (d) => d.slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

router.get('/xlsx', async (req, res, next) => {
  try {
    const userId = req.userId;
    const [categories, transactions, budgets, bills, goals, accounts, snapshots] = await Promise.all([
      sql`SELECT * FROM categories WHERE user_id = ${userId}`,
      sql`SELECT * FROM transactions WHERE user_id = ${userId} ORDER BY date`,
      sql`SELECT * FROM budgets WHERE user_id = ${userId}`,
      sql`SELECT * FROM bills WHERE user_id = ${userId}`,
      sql`SELECT * FROM goals WHERE user_id = ${userId}`,
      sql`SELECT * FROM accounts WHERE user_id = ${userId} ORDER BY created_at`,
      sql`SELECT * FROM account_snapshots WHERE user_id = ${userId} ORDER BY date`
    ]);

    const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
    const catName = (id) => catById[id]?.name || 'Uncategorised';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Wealthline';
    wb.created = new Date();

    /* ---------- Transactions: the flat sheet everything else pivots from ---------- */
    const tx = wb.addWorksheet('Transactions');
    tx.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Month', key: 'month', width: 10 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Description', key: 'description', width: 34 },
      { header: 'Amount', key: 'amount', width: 14 },
      // Signed so a plain SUM over any selection gives net cash flow.
      { header: 'Signed Amount', key: 'signed', width: 15 }
    ];
    for (const t of transactions) {
      tx.addRow({
        date: excelDate(t.date),
        year: Number(t.date.slice(0, 4)),
        month: monthLabel(monthKey(t.date)),
        type: t.type === 'income' ? 'Income' : 'Expense',
        category: catName(t.category_id),
        description: t.description || '',
        amount: t.amount,
        signed: t.type === 'income' ? t.amount : -t.amount
      });
    }
    tx.getColumn('date').numFmt = DATE;
    tx.getColumn('amount').numFmt = MONEY;
    tx.getColumn('signed').numFmt = MONEY;
    styleSheet(tx);

    /* ---------- Monthly summary ---------- */
    const months = [...new Set(transactions.map((t) => monthKey(t.date)))].sort();
    const summary = wb.addWorksheet('Monthly Summary');
    summary.columns = [
      { header: 'Month', key: 'month', width: 14 },
      { header: 'Income', key: 'income', width: 14 },
      { header: 'Expenses', key: 'expenses', width: 14 },
      { header: 'Net', key: 'net', width: 14 },
      { header: 'Savings Rate', key: 'rate', width: 14 }
    ];
    for (const m of months) {
      const rows = transactions.filter((t) => t.date.startsWith(m));
      const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      summary.addRow({
        month: monthLabel(m),
        income,
        expenses,
        net: income - expenses,
        rate: income > 0 ? ((income - expenses) / income) * 100 : 0
      });
    }
    ['income', 'expenses', 'net'].forEach((k) => (summary.getColumn(k).numFmt = MONEY));
    summary.getColumn('rate').numFmt = PERCENT;
    if (months.length) {
      const totalRow = summary.addRow({
        month: 'Total',
        income: { formula: `SUM(B2:B${months.length + 1})` },
        expenses: { formula: `SUM(C2:C${months.length + 1})` },
        net: { formula: `SUM(D2:D${months.length + 1})` }
      });
      totalRow.font = { bold: true };
      totalRow.border = { top: { style: 'thin' } };
    }
    styleSheet(summary);

    /* ---------- Category × month matrix ---------- */
    const matrix = wb.addWorksheet('Category by Month');
    const expenseCats = categories.filter((c) => c.type === 'expense').map((c) => c.name).sort();
    matrix.columns = [
      { header: 'Category', key: 'category', width: 20 },
      ...months.map((m) => ({ header: monthLabel(m), key: m, width: 13 })),
      { header: 'Total', key: 'total', width: 14 }
    ];
    for (const name of expenseCats) {
      const row = { category: name };
      let total = 0;
      for (const m of months) {
        const v = transactions
          .filter((t) => t.date.startsWith(m) && catName(t.category_id) === name && t.type === 'expense')
          .reduce((s, t) => s + t.amount, 0);
        row[m] = v;
        total += v;
      }
      // Categories never spent in are noise in a comparison grid.
      if (total === 0) continue;
      row.total = total;
      matrix.addRow(row);
    }
    matrix.columns.forEach((c, i) => {
      if (i > 0) matrix.getColumn(i + 1).numFmt = MONEY;
    });
    matrix.getColumn('total').font = { bold: true };
    styleSheet(matrix);

    /* ---------- Budget vs actual ---------- */
    const budgetSheet = wb.addWorksheet('Budget vs Actual');
    budgetSheet.columns = [
      { header: 'Month', key: 'month', width: 14 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Budget', key: 'budget', width: 14 },
      { header: 'Actual', key: 'actual', width: 14 },
      { header: 'Remaining', key: 'remaining', width: 14 },
      { header: '% Used', key: 'used', width: 11 }
    ];
    for (const b of budgets.sort((a, z) => a.month.localeCompare(z.month))) {
      const actual = transactions
        .filter((t) => t.date.startsWith(b.month) && t.category_id === b.category_id)
        .reduce((s, t) => s + t.amount, 0);
      const row = budgetSheet.addRow({
        month: monthLabel(b.month),
        category: catName(b.category_id),
        budget: b.limit_amount,
        actual,
        remaining: b.limit_amount - actual,
        used: b.limit_amount > 0 ? (actual / b.limit_amount) * 100 : 0
      });
      if (actual > b.limit_amount) row.getCell('used').font = { color: { argb: 'FFC00000' }, bold: true };
    }
    ['budget', 'actual', 'remaining'].forEach((k) => (budgetSheet.getColumn(k).numFmt = MONEY));
    budgetSheet.getColumn('used').numFmt = PERCENT;
    styleSheet(budgetSheet);

    /* ---------- Accounts & net worth ---------- */
    if (accounts.length) {
      const acc = wb.addWorksheet('Accounts');
      acc.columns = [
        { header: 'Account', key: 'name', width: 24 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Class', key: 'class', width: 12 },
        { header: 'Balance', key: 'balance', width: 16 }
      ];
      for (const a of accounts) {
        acc.addRow({
          name: a.name,
          type: a.type,
          class: a.is_liability ? 'Liability' : 'Asset',
          balance: a.is_liability ? -a.balance : a.balance
        });
      }
      acc.getColumn('balance').numFmt = MONEY;
      const net = acc.addRow({
        name: 'Net Worth',
        balance: { formula: `SUM(D2:D${accounts.length + 1})` }
      });
      net.font = { bold: true };
      net.border = { top: { style: 'thin' } };
      styleSheet(acc);

      if (snapshots.length) {
        const hist = wb.addWorksheet('Net Worth History');
        hist.columns = [
          { header: 'Date', key: 'date', width: 12 },
          { header: 'Assets', key: 'assets', width: 16 },
          { header: 'Liabilities', key: 'liabilities', width: 16 },
          { header: 'Net Worth', key: 'net', width: 16 }
        ];
        const accById = Object.fromEntries(accounts.map((a) => [a.id, a]));
        const known = {};
        const byDate = {};
        for (const s of snapshots) (byDate[s.date] ||= []).push(s);
        for (const date of Object.keys(byDate).sort()) {
          for (const s of byDate[date]) known[s.account_id] = s.balance;
          let assets = 0;
          let liabilities = 0;
          for (const [id, bal] of Object.entries(known)) {
            const a = accById[id];
            if (!a) continue;
            if (a.is_liability) liabilities += bal;
            else assets += bal;
          }
          hist.addRow({ date: excelDate(date), assets, liabilities, net: assets - liabilities });
        }
        hist.getColumn('date').numFmt = DATE;
        ['assets', 'liabilities', 'net'].forEach((k) => (hist.getColumn(k).numFmt = MONEY));
        styleSheet(hist);
      }
    }

    /* ---------- Recurring bills ---------- */
    if (bills.length) {
      const bl = wb.addWorksheet('Recurring Bills');
      bl.columns = [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Frequency', key: 'frequency', width: 12 },
        { header: 'Due Day', key: 'dueDay', width: 10 },
        { header: 'Amount', key: 'amount', width: 14 },
        { header: 'Annual Cost', key: 'annual', width: 14 }
      ];
      const perYear = { monthly: 12, weekly: 52, yearly: 1 };
      for (const b of bills) {
        bl.addRow({
          name: b.name,
          category: catName(b.category_id),
          frequency: b.frequency,
          dueDay: b.due_day,
          amount: b.amount,
          annual: b.amount * (perYear[b.frequency] || 12)
        });
      }
      bl.getColumn('amount').numFmt = MONEY;
      bl.getColumn('annual').numFmt = MONEY;
      const t = bl.addRow({ name: 'Total', annual: { formula: `SUM(F2:F${bills.length + 1})` } });
      t.font = { bold: true };
      styleSheet(bl);
    }

    /* ---------- Goals ---------- */
    if (goals.length) {
      const gl = wb.addWorksheet('Goals');
      gl.columns = [
        { header: 'Goal', key: 'name', width: 24 },
        { header: 'Target', key: 'target', width: 16 },
        { header: 'Target Date', key: 'date', width: 14 },
        { header: 'Current', key: 'current', width: 16 },
        { header: 'Monthly', key: 'monthly', width: 14 },
        { header: 'Return %', key: 'ret', width: 11 },
        { header: 'Projected', key: 'projected', width: 16 },
        { header: 'On Track', key: 'onTrack', width: 11 }
      ];
      for (const g of goals) {
        const target = new Date(g.target_date);
        const now = new Date();
        const months_ = Math.max(
          0,
          (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
        );
        const r = g.expected_return_pct / 100 / 12;
        const growth = Math.pow(1 + r, months_);
        const projected =
          g.current_amount * growth + (r === 0 ? g.monthly_contribution * months_ : g.monthly_contribution * ((growth - 1) / r));
        const row = gl.addRow({
          name: g.name,
          target: g.target_amount,
          date: target,
          current: g.current_amount,
          monthly: g.monthly_contribution,
          ret: g.expected_return_pct,
          projected,
          onTrack: projected >= g.target_amount ? 'Yes' : 'No'
        });
        row.getCell('onTrack').font = {
          bold: true,
          color: { argb: projected >= g.target_amount ? 'FF107C41' : 'FFC00000' }
        };
      }
      ['target', 'current', 'monthly', 'projected'].forEach((k) => (gl.getColumn(k).numFmt = MONEY));
      gl.getColumn('date').numFmt = DATE;
      gl.getColumn('ret').numFmt = PERCENT;
      styleSheet(gl);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="wealthline-${stamp}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
