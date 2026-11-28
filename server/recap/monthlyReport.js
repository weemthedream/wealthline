// Monthly recap: the data, the suggestions, the Excel workbook (with real
// charts) and the email that carries it.

const { buildXlsx } = require('./xlsx');

// ---------- dates & formatting ----------
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthName(month, opts = { month: 'long', year: 'numeric' }) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

function usd(n, cents = false) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0
  });
}

function excelSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

function merchantKey(description) {
  const s = String(description || '')
    .toLowerCase()
    .replace(/^(pos|debit card purchase|debit|purchase|recurring|ach|card)\s+/, '')
    .replace(/^(sq|tst|sp|py|pp|paypal)\s*\*\s*/, '')
    .replace(/[#*].*$/, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^a-z&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s
    .split(' ')
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .join(' ');
}

function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- data ----------
async function loadMonthData(sql, userId, month) {
  const sixAgo = shiftMonth(month, -5);
  const start = `${sixAgo}-01`;
  const end = `${shiftMonth(month, 1)}-01`;

  const [categories, txs, budgets, bills] = await Promise.all([
    sql`SELECT * FROM categories WHERE user_id = ${userId}`,
    sql`SELECT * FROM transactions WHERE user_id = ${userId} AND date >= ${start} AND date < ${end} ORDER BY date`,
    sql`SELECT * FROM budgets WHERE user_id = ${userId} AND month = ${month}`,
    sql`SELECT * FROM bills WHERE user_id = ${userId}`
  ]);
  return shapeReport({ month, categories, txs, budgets, bills });
}

// Pure: turns rows into the report. Kept separate so it can be tested without a database.
function shapeReport({ month, categories, txs, budgets, bills }) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const prevMonth = shiftMonth(month, -1);
  const inMonth = (t, m) => t.date.startsWith(m);
  const sum = (rows, type) => rows.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  const monthTx = txs.filter((t) => inMonth(t, month));
  const prevTx = txs.filter((t) => inMonth(t, prevMonth));

  const income = sum(monthTx, 'income');
  const expenses = sum(monthTx, 'expense');
  const prevIncome = sum(prevTx, 'income');
  const prevExpenses = sum(prevTx, 'expense');

  const spendBy = (rows) => {
    const out = {};
    for (const t of rows) if (t.type === 'expense') out[t.category_id] = (out[t.category_id] || 0) + t.amount;
    return out;
  };
  const cur = spendBy(monthTx);
  const prev = spendBy(prevTx);
  // Average of the three months before this one, for suggested budget sizes.
  const priorThree = [1, 2, 3].map((k) => spendBy(txs.filter((t) => inMonth(t, shiftMonth(month, -k)))));
  const monthsWithData = [1, 2, 3].filter((k) => txs.some((t) => inMonth(t, shiftMonth(month, -k)))).length;

  const budgetBy = Object.fromEntries(budgets.map((b) => [b.category_id, b.limit_amount]));
  const ids = new Set([...Object.keys(cur), ...budgets.map((b) => b.category_id)]);
  const cats = [...ids]
    .filter((id) => !catById[id] || catById[id].type === 'expense')
    .map((id) => {
      const avg = monthsWithData ? priorThree.reduce((s, m) => s + (m[id] || 0), 0) / monthsWithData : null;
      return {
        id,
        name: catById[id] ? catById[id].name : 'Uncategorized',
        color: catById[id] ? catById[id].color : '#868e96',
        spent: cur[id] || 0,
        budget: budgetBy[id] !== undefined ? budgetBy[id] : null,
        prevSpent: prev[id] || 0,
        avg3: avg
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const trend = [];
  for (let k = 5; k >= 0; k--) {
    const m = shiftMonth(month, -k);
    const rows = txs.filter((t) => inMonth(t, m));
    trend.push({
      month: m,
      label: monthName(m, { month: 'short', year: 'numeric' }),
      income: sum(rows, 'income'),
      expenses: sum(rows, 'expense')
    });
  }

  const merchants = {};
  for (const t of monthTx) {
    if (t.type !== 'expense') continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    if (!merchants[key]) merchants[key] = { name: titleCase(key), total: 0, count: 0 };
    merchants[key].total += t.amount;
    merchants[key].count++;
  }
  const topMerchants = Object.values(merchants)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const monthlyBills = bills.filter((b) => b.active !== false && (b.frequency || 'monthly') === 'monthly');
  const unpaidBills = monthlyBills.filter((b) => !JSON.parse(b.paid_months || '[]').includes(month));

  const transactions = monthTx.map((t) => ({
    date: t.date,
    description: t.description || '',
    category: catById[t.category_id] ? catById[t.category_id].name : 'Uncategorized',
    type: t.type,
    amount: t.amount
  }));

  const report = {
    month,
    monthLabel: monthName(month),
    prevLabel: monthName(prevMonth, { month: 'long' }),
    income,
    expenses,
    net: income - expenses,
    savingsRate: income > 0 ? (income - expenses) / income : null,
    prevIncome,
    prevExpenses,
    hasPrev: prevTx.length > 0,
    categories: cats,
    trend,
    topMerchants,
    unpaidBills: unpaidBills.map((b) => ({ name: b.name, amount: b.amount, dueDay: b.due_day })),
    transactions,
    count: monthTx.length
  };
  report.suggestions = buildSuggestions(report);
  return report;
}

// ---------- suggestions ----------
// Specific, neutral, and each one says what to do. Most important first.
function buildSuggestions(r) {
  const out = [];
  const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

  for (const c of r.categories.filter((c) => c.budget !== null && c.spent > c.budget).slice(0, 2)) {
    const over = c.spent - c.budget;
    const realistic = c.avg3 && c.avg3 > c.budget * 1.25 ? round5(c.avg3) : null;
    out.push({
      priority: 1,
      title: `${c.name} went ${usd(over)} over budget`,
      text: realistic
        ? `You spent ${usd(c.spent)} against your ${usd(c.budget)} budget, and your last three months averaged ${usd(c.avg3)}. Either raise the budget to about ${usd(realistic)} so it reflects real life, or pick one habit in this category to cut next month.`
        : `You spent ${usd(c.spent)} against your ${usd(c.budget)} budget. To land on budget next month, that's about ${usd(c.budget / 4.3)} a week for ${c.name}.`
    });
  }

  if (r.net < 0 && r.income > 0) {
    out.push({
      priority: 1,
      title: `Spending passed income by ${usd(-r.net)}`,
      text: `Closing that gap next month means spending about ${usd(-r.net / 4.3)} less each week. The categories above are the easiest place to find it.`
    });
  } else if (r.savingsRate !== null && r.savingsRate >= 0 && r.savingsRate < 0.1) {
    out.push({
      priority: 2,
      title: `You kept ${Math.round(r.savingsRate * 100)}% of your income`,
      text: `The widely used 50/30/20 guideline puts savings at 20%. Moving ${usd(r.income * 0.1)} (10% of this month's income) to savings right after payday is a realistic next step.`
    });
  }

  const unbudgeted = r.categories.filter((c) => c.budget === null && r.expenses > 0 && c.spent / r.expenses >= 0.15);
  for (const c of unbudgeted.slice(0, 2)) {
    const suggested = round5(c.avg3 ? Math.max(c.avg3, c.spent * 0.9) : c.spent);
    out.push({
      priority: 2,
      title: `Set a budget for ${c.name}`,
      text: `${c.name} was ${Math.round((c.spent / r.expenses) * 100)}% of your spending (${usd(c.spent)}) with no budget. A budget of about ${usd(suggested)} would let Wealthline warn you before it runs over.`
    });
  }

  if (r.hasPrev) {
    const spikes = r.categories
      .filter((c) => c.prevSpent > 0 && c.spent - c.prevSpent >= 50 && c.spent / c.prevSpent >= 1.5)
      .sort((a, b) => b.spent - b.prevSpent - (a.spent - a.prevSpent));
    if (spikes[0]) {
      const c = spikes[0];
      out.push({
        priority: 3,
        title: `${c.name} jumped ${usd(c.spent - c.prevSpent)} from ${r.prevLabel}`,
        text: `If it was a one-off, no action needed. If not, check the Transactions sheet for new subscriptions or repeat purchases.`
      });
    }
  }

  if (r.unpaidBills.length) {
    const names = r.unpaidBills
      .slice(0, 3)
      .map((b) => `${b.name} (${usd(b.amount, true)})`)
      .join(', ');
    out.push({
      priority: 2,
      title: `${r.unpaidBills.length} bill${r.unpaidBills.length === 1 ? '' : 's'} not marked paid`,
      text: `${names}${r.unpaidBills.length > 3 ? ' and more' : ''}. Mark ${
        r.unpaidBills.length === 1 ? 'it' : 'them'
      } paid on the Bills page, or check ${r.unpaidBills.length === 1 ? 'it' : 'they'} actually went out.`
    });
  }

  if (r.categories.every((c) => c.budget === null) && r.categories.length) {
    const top = r.categories
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ');
    out.push({
      priority: 2,
      title: 'Start with three budgets',
      text: `No budgets were set this month. Budgets for your three biggest categories (${top}) cover most of your spending with very little setup.`
    });
  }

  const kept = r.categories.filter((c) => c.budget !== null && c.spent <= c.budget);
  const budgeted = r.categories.filter((c) => c.budget !== null);
  if (kept.length) {
    out.push({
      priority: 4,
      title:
        kept.length === budgeted.length ? 'Every budget held' : `${kept.length} of ${budgeted.length} budgets held`,
      text: `${kept
        .slice(0, 3)
        .map((c) => c.name)
        .join(', ')}${kept.length > 3 ? ' and more' : ''} stayed within budget. Keep those limits as they are.`
    });
  } else if (r.net > 0) {
    out.push({
      priority: 4,
      title: `You saved ${usd(r.net)}`,
      text: 'Income beat spending this month. Consider moving it to savings before it gets spent.'
    });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// ---------- workbook ----------
const C = {
  income: '#1A7F4E',
  expense: '#C93B3B',
  budget: '#B9B4F4',
  spent: '#4F46E5'
};

function buildRecapWorkbook(r) {
  const cats = r.categories.slice(0, 10);
  const catSheet = 'Categories';
  const trendSheet = 'Trend';

  // Categories sheet (data behind charts 1 and 3)
  const catRows = [
    [
      { v: 'Category', s: 'header' },
      { v: 'Spent', s: 'header' },
      { v: 'Budget', s: 'header' },
      { v: 'Left (+) / Over (−)', s: 'header' },
      { v: 'Share of spending', s: 'header' },
      { v: `${r.prevLabel}`, s: 'header' },
      { v: 'Change', s: 'header' }
    ],
    ...r.categories.map((c, i) => {
      const row = i + 2;
      return [
        c.name,
        { v: c.spent, s: 'money' },
        c.budget === null ? { v: '', s: 'money' } : { v: c.budget, s: 'money' },
        c.budget === null ? '' : { f: `C${row}-B${row}`, v: c.budget - c.spent, s: 'money' },
        r.expenses > 0
          ? { f: `B${row}/SUM($B$2:$B$${r.categories.length + 1})`, v: c.spent / r.expenses, s: 'percent' }
          : '',
        { v: c.prevSpent, s: 'money' },
        { f: `B${row}-F${row}`, v: c.spent - c.prevSpent, s: 'money' }
      ];
    }),
    [
      { v: 'Total', s: 'bold' },
      { f: `SUM(B2:B${r.categories.length + 1})`, v: r.expenses, s: 'moneyBold' },
      {
        f: `SUM(C2:C${r.categories.length + 1})`,
        v: r.categories.reduce((s, c) => s + (c.budget || 0), 0),
        s: 'moneyBold'
      }
    ]
  ];

  // Trend sheet (data behind chart 2)
  const trendRows = [
    [
      { v: 'Month', s: 'header' },
      { v: 'Income', s: 'header' },
      { v: 'Expenses', s: 'header' },
      { v: 'Net', s: 'header' }
    ],
    ...r.trend.map((t, i) => [
      t.label,
      { v: t.income, s: 'money' },
      { v: t.expenses, s: 'money' },
      { f: `B${i + 2}-C${i + 2}`, v: t.income - t.expenses, s: 'money' }
    ])
  ];

  const txRows = [
    [
      { v: 'Date', s: 'header' },
      { v: 'Description', s: 'header' },
      { v: 'Category', s: 'header' },
      { v: 'Type', s: 'header' },
      { v: 'Amount', s: 'header' }
    ],
    ...r.transactions.map((t) => [
      { v: excelSerial(t.date), s: 'date' },
      t.description,
      t.category,
      t.type === 'income' ? 'Income' : 'Expense',
      { v: t.type === 'income' ? t.amount : -t.amount, s: 'money' }
    ])
  ];

  // Recap sheet: numbers, suggestions, then the three charts.
  const diffLine = (cur, prev) => {
    if (!r.hasPrev || !prev) return '';
    const d = cur - prev;
    if (Math.abs(d) < 1) return `Same as ${r.prevLabel}`;
    return `${d > 0 ? '▲' : '▼'} ${usd(Math.abs(d))} vs ${r.prevLabel}`;
  };

  const rows = [];
  const merges = ['A1:H1', 'A2:H2'];
  const heights = { 1: 30, 5: 26 };
  rows.push([{ v: `Wealthline · ${r.monthLabel} recap`, s: 'title' }]);
  rows.push([
    {
      v: 'The charts below are live Excel charts: edit the Categories or Trend sheets and they update.',
      s: 'subtitle'
    }
  ]);
  rows.push([]);
  rows.push([
    { v: 'INCOME', s: 'kpiLabel' },
    { v: '', s: 'kpiLabel' },
    { v: 'SPENT', s: 'kpiLabel' },
    { v: '', s: 'kpiLabel' },
    { v: 'NET', s: 'kpiLabel' },
    { v: '', s: 'kpiLabel' },
    { v: 'SAVINGS RATE', s: 'kpiLabel' },
    { v: '', s: 'kpiLabel' }
  ]);
  rows.push([
    { v: r.income, s: 'kpiMoney' },
    { v: '', s: 'kpiMoney' },
    { v: r.expenses, s: 'kpiMoney' },
    { v: '', s: 'kpiMoney' },
    { v: r.net, s: 'kpiMoney' },
    { v: '', s: 'kpiMoney' },
    r.savingsRate === null ? { v: '—', s: 'kpiPercent' } : { v: r.savingsRate, s: 'kpiPercent' },
    { v: '', s: 'kpiPercent' }
  ]);
  rows.push([
    { v: diffLine(r.income, r.prevIncome), s: 'muted' },
    '',
    { v: diffLine(r.expenses, r.prevExpenses), s: 'muted' },
    '',
    { v: `${r.count} transactions`, s: 'muted' }
  ]);
  merges.push('A4:B4', 'C4:D4', 'E4:F4', 'G4:H4', 'A5:B5', 'C5:D5', 'E5:F5', 'G5:H5', 'A6:B6', 'C6:D6', 'E6:H6');
  rows.push([]);
  rows.push([{ v: 'What to do next', s: 'bold' }]);
  r.suggestions.forEach((sg, i) => {
    const rowNo = rows.length + 1;
    rows.push([{ v: `${i + 1}. ${sg.title}. ${sg.text}`, s: 'wrap' }]);
    merges.push(`A${rowNo}:H${rowNo}`);
    heights[rowNo] = 46;
  });
  if (!r.suggestions.length) rows.push([{ v: 'Nothing stood out this month.', s: 'muted' }]);
  rows.push([]);
  if (r.topMerchants.length) {
    rows.push([{ v: 'Where the money went most', s: 'bold' }]);
    for (const m of r.topMerchants) {
      rows.push([m.name, '', '', { v: m.total, s: 'money' }, { v: `${m.count}×`, s: 'muted' }]);
      merges.push(`A${rows.length}:C${rows.length}`);
    }
    rows.push([]);
  }
  const chartTop = rows.length + 1; // 0-based row index for the drawing anchor

  const charts = [];
  if (cats.length) {
    charts.push({
      type: 'bar',
      title: 'Spent vs budget by category',
      from: [0, chartTop],
      to: [8, chartTop + Math.max(14, cats.length * 2 + 4)],
      categories: { sheet: catSheet, col: 0, from: 2, to: cats.length + 1 },
      series: [
        { name: 'Spent', sheet: catSheet, col: 1, from: 2, to: cats.length + 1, color: C.spent },
        { name: 'Budget', sheet: catSheet, col: 2, from: 2, to: cats.length + 1, color: C.budget }
      ]
    });
  }
  const secondTop = charts.length ? charts[0].to[1] + 1 : chartTop;
  charts.push({
    type: 'col',
    title: 'Income vs spending, last 6 months',
    from: [0, secondTop],
    to: [5, secondTop + 16],
    categories: { sheet: trendSheet, col: 0, from: 2, to: r.trend.length + 1 },
    series: [
      { name: 'Income', sheet: trendSheet, col: 1, from: 2, to: r.trend.length + 1, color: C.income },
      { name: 'Spending', sheet: trendSheet, col: 2, from: 2, to: r.trend.length + 1, color: C.expense }
    ]
  });
  const share = r.categories.filter((c) => c.spent > 0).slice(0, 6);
  if (share.length) {
    charts.push({
      type: 'doughnut',
      title: 'Share of spending',
      from: [5, secondTop],
      to: [10, secondTop + 16],
      categories: { sheet: catSheet, col: 0, from: 2, to: share.length + 1 },
      series: [{ name: 'Spent', sheet: catSheet, col: 1, from: 2, to: share.length + 1 }],
      pointColors: share.map((c) => c.color)
    });
  }

  return buildXlsx({
    title: `Wealthline ${r.monthLabel} recap`,
    sheets: [
      {
        name: 'Recap',
        cols: [13, 13, 13, 13, 13, 13, 13, 13, 13, 13],
        rows,
        merges,
        rowHeights: heights,
        charts,
        hideGrid: true,
        fitWidth: true
      },
      { name: catSheet, cols: [22, 13, 13, 18, 17, 14, 13], rows: catRows, freezeRow: 1 },
      { name: trendSheet, cols: [14, 13, 13, 13], rows: trendRows, freezeRow: 1 },
      { name: 'Transactions', cols: [12, 36, 20, 10, 13], rows: txRows, freezeRow: 1 }
    ]
  });
}

// ---------- email ----------
function escHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function renderRecapEmail(r, { appUrl, unsubscribeUrl }) {
  const kpi = (label, value, color = '#1C1B19') => `
    <td style="padding:12px 14px;background:#F6F5F2;border-radius:8px;width:25%;">
      <div style="font-size:11px;letter-spacing:.06em;color:#57534D;font-weight:600;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color};margin-top:4px;">${value}</div>
    </td>`;
  const maxSpent = Math.max(1, ...r.categories.slice(0, 5).map((c) => Math.max(c.spent, c.budget || 0)));
  const catRows = r.categories
    .slice(0, 5)
    .map((c) => {
      const over = c.budget !== null && c.spent > c.budget;
      const w = Math.round((c.spent / maxSpent) * 100);
      return `
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#1C1B19;width:34%;">${escHtml(c.name)}</td>
        <td style="padding:6px 12px;width:40%;">
          <div style="background:#F1EFEB;border-radius:4px;height:10px;"><div style="background:${over ? '#C93B3B' : '#4F46E5'};width:${w}%;height:10px;border-radius:4px;"></div></div>
        </td>
        <td style="padding:6px 0;font-size:14px;text-align:right;white-space:nowrap;color:${over ? '#B42F2F' : '#1C1B19'};font-weight:600;">
          ${usd(c.spent)}${c.budget !== null ? `<span style="color:#57534D;font-weight:400;"> / ${usd(c.budget)}</span>` : ''}
        </td>
      </tr>`;
    })
    .join('');
  const suggestions = r.suggestions
    .map(
      (s, i) => `
      <tr><td style="padding:10px 0;border-top:1px solid #ECEAE5;">
        <div style="font-size:14px;font-weight:600;color:#1C1B19;">${i + 1}. ${escHtml(s.title)}</div>
        <div style="font-size:14px;color:#57534D;margin-top:3px;line-height:1.45;">${escHtml(s.text)}</div>
      </td></tr>`
    )
    .join('');
  const netColor = r.net >= 0 ? '#1A7F4E' : '#B42F2F';

  return `<!doctype html><html><body style="margin:0;background:#F6F5F2;">
  <div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#FFFFFF;border:1px solid #E4E1DB;border-radius:12px;padding:24px;">
      <div style="font-size:13px;color:#57534D;">Wealthline monthly recap</div>
      <h1 style="font-size:22px;margin:4px 0 18px;color:#1C1B19;">Your ${escHtml(r.monthLabel)}</h1>
      <table role="presentation" width="100%" cellspacing="6" cellpadding="0" style="border-collapse:separate;margin:0 -6px;">
        <tr>
          ${kpi('INCOME', usd(r.income), '#1A7F4E')}
          ${kpi('SPENT', usd(r.expenses))}
          ${kpi('NET', usd(r.net), netColor)}
          ${kpi('SAVED', r.savingsRate === null ? '—' : `${Math.round(r.savingsRate * 100)}%`)}
        </tr>
      </table>

      ${
        r.suggestions.length
          ? `<h2 style="font-size:16px;margin:24px 0 4px;color:#1C1B19;">What to do next</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${suggestions}</table>`
          : ''
      }

      ${
        catRows
          ? `<h2 style="font-size:16px;margin:24px 0 8px;color:#1C1B19;">Top categories</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${catRows}</table>`
          : ''
      }

      <p style="font-size:14px;color:#1C1B19;margin:24px 0 0;line-height:1.5;">
        📎 The attached Excel file has charts of spending vs budget, your last six months, and where your money went, plus every transaction from ${escHtml(r.monthLabel)}.
      </p>
      <p style="margin:20px 0 0;">
        <a href="${escHtml(appUrl)}" style="display:inline-block;background:#4F46E5;color:#FFFFFF;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open Wealthline</a>
      </p>
    </div>
    <p style="font-size:12px;color:#7D786F;text-align:center;margin:16px 0 0;line-height:1.5;">
      You're getting this because monthly recaps are turned on in Wealthline.<br>
      <a href="${escHtml(unsubscribeUrl)}" style="color:#7D786F;">Turn off monthly recaps</a>
    </p>
  </div></body></html>`;
}

function recapFilename(r) {
  return `Wealthline ${r.monthLabel} recap.xlsx`;
}

module.exports = {
  loadMonthData,
  shapeReport,
  buildSuggestions,
  buildRecapWorkbook,
  renderRecapEmail,
  recapFilename,
  shiftMonth
};
