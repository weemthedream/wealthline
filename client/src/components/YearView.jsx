import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Scale, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../api.js';
import { ChartTooltip, axisProps, gridProps, money } from '../chartTheme.jsx';

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

// Arrow = direction, colour = whether that direction is good news for this metric.
function YoyPill({ pct, risingIsGood = true }) {
  if (pct === null || pct === undefined || !isFinite(pct) || Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  const good = up === risingIsGood;
  return (
    <span className={`trend-pill ${good ? 'up' : 'down'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(0)}% YoY
    </span>
  );
}

function foldSlices(slices, max = 6) {
  if (slices.length <= max) return slices;
  const head = slices.slice(0, max - 1);
  const tail = slices.slice(max - 1);
  return [
    ...head,
    {
      categoryId: '__other__',
      name: `Other (${tail.length})`,
      color: 'var(--text-faint)',
      type: 'expense',
      total: tail.reduce((s, t) => s + t.total, 0)
    }
  ];
}

export default function YearView({ year, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getYearSummary(year)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [year, refreshKey]);

  if (error) return <div className="error-box">Couldn't load year view: {error}</div>;
  if (!summary) return <div className="loading">Loading…</div>;

  const expenseSlices = foldSlices(summary.byCategory.filter((c) => c.type === 'expense'));
  const chartData = summary.months.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const empty = summary.months.every((m) => m.income === 0 && m.expenses === 0);

  return (
    <div className="year-view">
      <div className="summary-cards">
        <div className="card income">
          <div className="card-top">
            <span className="card-icon">
              <ArrowUpRight size={15} />
            </span>
            <span className="card-label">Income · {year}</span>
          </div>
          <div className="card-value">
            {money(summary.income)}
            {summary.yoy && <YoyPill pct={summary.yoy.incomeChangePct} />}
          </div>
        </div>

        <div className="card expense">
          <div className="card-top">
            <span className="card-icon">
              <ArrowDownRight size={15} />
            </span>
            <span className="card-label">Expenses · {year}</span>
          </div>
          <div className="card-value">
            {money(summary.expenses)}
            {summary.yoy && <YoyPill pct={summary.yoy.expensesChangePct} risingIsGood={false} />}
          </div>
        </div>

        <div className={`card net ${summary.net >= 0 ? 'positive' : 'negative'}`}>
          <div className="card-top">
            <span className="card-icon">
              <Scale size={15} />
            </span>
            <span className="card-label">Net Savings</span>
          </div>
          <div className="card-value">{money(summary.net)}</div>
          <div className="card-sub">{summary.savingsRate.toFixed(0)}% savings rate</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel full-width">
          <h3>Monthly Income vs Expenses</h3>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 10 }}>
            {year}
          </p>
          {empty ? (
            <p className="empty-hint">No transactions recorded for {year} yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} width={56} tickFormatter={(v) => money(v, { compact: true })} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-alt)' }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                <Bar dataKey="income" fill="var(--income)" name="Income" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="expenses" fill="var(--expense)" name="Expenses" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h3>Spending by Category</h3>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 6 }}>
            {year}
          </p>
          {expenseSlices.length === 0 ? (
            <p className="empty-hint">No expenses recorded for {year} yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <PieChart>
                <Pie
                  data={expenseSlices}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="46%"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  cornerRadius={3}
                  stroke="var(--surface)"
                  strokeWidth={2}
                >
                  {expenseSlices.map((slice) => (
                    <Cell key={slice.categoryId} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h3>Annual Budget Adherence</h3>
          {summary.budgetAdherence.length === 0 ? (
            <p className="empty-hint" style={{ marginTop: 6 }}>
              No budgets were set during {year}.
            </p>
          ) : (
            <div className="budget-list" style={{ marginTop: 14 }}>
              {summary.budgetAdherence.map((b) => {
                const pct = b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
                const over = b.spent > b.limit;
                return (
                  <div key={b.categoryId}>
                    <div className="budget-row-header">
                      <span>
                        <span className="color-dot" style={{ background: b.color }} />
                        {b.name}
                      </span>
                      <span className={over ? 'over-budget' : ''}>
                        {money(b.spent)} / {money(b.limit)}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${pct}%`, background: over ? 'var(--expense)' : b.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
