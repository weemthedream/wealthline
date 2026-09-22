import React, { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Scale, TrendingUp, TrendingDown, AlertTriangle, AlertOctagon, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { ChartTooltip, axisProps, gridProps, money } from '../chartTheme.jsx';

function formatMonthShort(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

// The arrow shows direction; the colour shows whether that direction is good news.
// Rising income is good, rising spending is not.
function TrendPill({ current, previous, risingIsGood = true }) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (!isFinite(pct) || Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  const good = up === risingIsGood;
  return (
    <span className={`trend-pill ${good ? 'up' : 'down'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

const INSIGHT_ICON = { danger: AlertOctagon, warning: AlertTriangle, positive: Sparkles };

// Part-to-whole reads at a glance only up to ~6 segments; the tail folds into "Other".
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

export default function Dashboard({ month, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSummary(month)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [month, refreshKey]);

  if (error) return <div className="error-box">Couldn't load dashboard: {error}</div>;
  if (!summary) return <div className="loading">Loading…</div>;

  const expenseSlices = foldSlices(summary.byCategory.filter((c) => c.type === 'expense'));
  const trendData = summary.trend.map((t) => ({ ...t, label: formatMonthShort(t.month) }));
  const prevMonth = summary.trend.length >= 2 ? summary.trend[summary.trend.length - 2] : null;
  const savedPct = summary.income > 0 ? ((summary.income - summary.expenses) / summary.income) * 100 : null;

  return (
    <div className="dashboard">
      <div className="summary-cards">
        <div className="card income">
          <div className="card-top">
            <span className="card-icon">
              <ArrowUpRight size={15} />
            </span>
            <span className="card-label">Income</span>
          </div>
          <div className="card-value">
            {money(summary.income)}
            {prevMonth && <TrendPill current={summary.income} previous={prevMonth.income} />}
          </div>
        </div>

        <div className="card expense">
          <div className="card-top">
            <span className="card-icon">
              <ArrowDownRight size={15} />
            </span>
            <span className="card-label">Expenses</span>
          </div>
          <div className="card-value">
            {money(summary.expenses)}
            {prevMonth && <TrendPill current={summary.expenses} previous={prevMonth.expenses} risingIsGood={false} />}
          </div>
        </div>

        <div className={`card net ${summary.net >= 0 ? 'positive' : 'negative'}`}>
          <div className="card-top">
            <span className="card-icon">
              <Scale size={15} />
            </span>
            <span className="card-label">Net</span>
          </div>
          <div className="card-value">{money(summary.net)}</div>
          <div className="card-sub">{savedPct !== null ? `${savedPct.toFixed(0)}% of income saved` : 'No income logged yet'}</div>
        </div>
      </div>

      {summary.insights?.length > 0 && (
        <div className="insights-list">
          {summary.insights.map((insight, i) => {
            const Icon = INSIGHT_ICON[insight.type] || Sparkles;
            return (
              <div className={`insight-card ${insight.type}`} key={i}>
                <span className="insight-icon">
                  <Icon size={15} />
                </span>
                {insight.text}
              </div>
            );
          })}
        </div>
      )}

      <div className="dashboard-grid">
        <div className="panel">
          <h3>Spending by Category</h3>
          {expenseSlices.length === 0 ? (
            <p className="empty-hint">No expenses recorded this month yet.</p>
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
          <h3>Income vs Expenses</h3>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 8 }}>Last 6 months</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--income)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--income)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--expense)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--expense)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={52} tickFormatter={(v) => money(v, { compact: true })} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
              <Area
                type="monotone"
                dataKey="income"
                stroke="var(--income)"
                fill="url(#incomeGrad)"
                strokeWidth={2}
                name="Income"
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="var(--expense)"
                fill="url(#expenseGrad)"
                strokeWidth={2}
                name="Expenses"
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel full-width">
          <h3>Budget Progress</h3>
          {summary.budgetProgress.length === 0 ? (
            <p className="empty-hint">No budgets set for this month. Add some in the Budgets tab.</p>
          ) : (
            <div className="budget-list" style={{ marginTop: 14 }}>
              {summary.budgetProgress.map((b) => {
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
