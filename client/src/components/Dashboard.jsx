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
import { api } from '../api.js';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatMonthShort(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

function TrendPill({ current, previous }) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (!isFinite(pct) || Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  return <span className={`trend-pill ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%</span>;
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

  const expenseSlices = summary.byCategory.filter((c) => c.type === 'expense');
  const trendData = summary.trend.map((t) => ({ ...t, label: formatMonthShort(t.month) }));
  const prevMonth = summary.trend.length >= 2 ? summary.trend[summary.trend.length - 2] : null;

  return (
    <div className="dashboard">
      <div className="summary-cards">
        <div className="card income">
          <div className="card-icon">↑</div>
          <div className="card-label">Income</div>
          <div className="card-value">
            {currency(summary.income)}
            {prevMonth && <TrendPill current={summary.income} previous={prevMonth.income} />}
          </div>
        </div>
        <div className="card expense">
          <div className="card-icon">↓</div>
          <div className="card-label">Expenses</div>
          <div className="card-value">
            {currency(summary.expenses)}
            {prevMonth && <TrendPill current={summary.expenses} previous={prevMonth.expenses} />}
          </div>
        </div>
        <div className={`card net ${summary.net >= 0 ? 'positive' : 'negative'}`}>
          <div className="card-icon">Σ</div>
          <div className="card-label">Net</div>
          <div className="card-value">{currency(summary.net)}</div>
          <div className="card-sub">
            {summary.income > 0 ? `${(((summary.income - summary.expenses) / summary.income) * 100).toFixed(0)}% saved` : '—'}
          </div>
        </div>
      </div>

      {summary.insights && summary.insights.length > 0 && (
        <div className="insights-list">
          {summary.insights.map((insight, i) => (
            <div className={`insight-card ${insight.type}`} key={i}>
              <span className="insight-icon">{insight.type === 'danger' ? '🚨' : insight.type === 'warning' ? '⚠️' : '✨'}</span>
              {insight.text}
            </div>
          ))}
        </div>
      )}

      <div className="dashboard-grid">
        <div className="panel">
          <h3>Spending by Category</h3>
          {expenseSlices.length === 0 ? (
            <p className="empty-hint">No expenses recorded this month yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={expenseSlices}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={98}
                  paddingAngle={2}
                  cornerRadius={4}
                >
                  {expenseSlices.map((slice) => (
                    <Cell key={slice.categoryId} fill={slice.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => currency(value)}
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h3>Income vs Expenses (6 months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--income)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--income)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--expense)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--expense)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(value) => currency(value)} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
              <Legend />
              <Area type="monotone" dataKey="income" stroke="var(--income)" fill="url(#incomeGrad)" strokeWidth={2} name="Income" />
              <Area type="monotone" dataKey="expenses" stroke="var(--expense)" fill="url(#expenseGrad)" strokeWidth={2} name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel full-width">
          <h3>Budget Progress</h3>
          {summary.budgetProgress.length === 0 ? (
            <p className="empty-hint">No budgets set for this month. Add some in the Budgets tab.</p>
          ) : (
            <div className="budget-list">
              {summary.budgetProgress.map((b) => {
                const pct = b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
                const over = b.spent > b.limit;
                return (
                  <div className="budget-row" key={b.categoryId}>
                    <div className="budget-row-header">
                      <span>
                        <span className="color-dot" style={{ background: b.color }} />
                        {b.name}
                      </span>
                      <span className={over ? 'over-budget' : ''}>
                        {currency(b.spent)} / {currency(b.limit)}
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
