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
import { api } from '../api.js';

function currency(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

function TrendPill({ pct }) {
  if (pct === null || pct === undefined || !isFinite(pct) || Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  return <span className={`trend-pill ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% YoY</span>;
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

  const expenseSlices = summary.byCategory.filter((c) => c.type === 'expense');
  const chartData = summary.months.map((m) => ({ ...m, label: monthLabel(m.month) }));

  return (
    <div className="year-view">
      <div className="summary-cards">
        <div className="card income">
          <div className="card-icon">↑</div>
          <div className="card-label">Income ({year})</div>
          <div className="card-value">
            {currency(summary.income)}
            {summary.yoy && <TrendPill pct={summary.yoy.incomeChangePct} />}
          </div>
        </div>
        <div className="card expense">
          <div className="card-icon">↓</div>
          <div className="card-label">Expenses ({year})</div>
          <div className="card-value">
            {currency(summary.expenses)}
            {summary.yoy && <TrendPill pct={summary.yoy.expensesChangePct} />}
          </div>
        </div>
        <div className={`card net ${summary.net >= 0 ? 'positive' : 'negative'}`}>
          <div className="card-icon">Σ</div>
          <div className="card-label">Net Savings</div>
          <div className="card-value">{currency(summary.net)}</div>
          <div className="card-sub">{summary.savingsRate.toFixed(0)}% savings rate</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel full-width">
          <h3>Monthly Income vs Expenses — {year}</h3>
          {summary.months.every((m) => m.income === 0 && m.expenses === 0) ? (
            <p className="empty-hint">No transactions recorded for {year} yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(value) => currency(value)}
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <Legend />
                <Bar dataKey="income" fill="var(--income)" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--expense)" name="Expenses" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <h3>Spending by Category — {year}</h3>
          {expenseSlices.length === 0 ? (
            <p className="empty-hint">No expenses recorded for {year} yet.</p>
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
          <h3>Annual Budget Adherence</h3>
          {summary.budgetAdherence.length === 0 ? (
            <p className="empty-hint">No budgets were set during {year}.</p>
          ) : (
            <div className="budget-list">
              {summary.budgetAdherence.map((b) => {
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
