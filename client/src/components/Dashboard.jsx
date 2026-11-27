import React, { useEffect, useState } from 'react';
import { BarChart, Bar, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../api.js';
import { ChartTooltip, axisProps, gridProps, money } from '../chartTheme.jsx';
import CashFlow from './CashFlow.jsx';

function formatMonthShort(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Where the month "should" be today, as a fraction: day 27 of 30 → 0.9.
// Past months are complete (1); future months haven't started (0).
function monthPace(month) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (month < thisMonth) return { pace: 1, day: null, days: daysInMonth(month) };
  if (month > thisMonth) return { pace: 0, day: null, days: daysInMonth(month) };
  const days = daysInMonth(month);
  return { pace: now.getDate() / days, day: now.getDate(), days };
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

function BudgetSnapshot({ budgets, month, onNavigate }) {
  const { pace, day, days } = monthPace(month);
  const showMarker = day !== null;
  const rows = [...budgets]
    .map((b) => ({ ...b, ratio: b.limit > 0 ? b.spent / b.limit : 0 }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5);

  return (
    <section className="panel overview-budgets">
      <div className="panel-head">
        <h3>Budgets</h3>
        <button className="link-btn" onClick={() => onNavigate('budgets')}>
          All budgets
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty-hint">No budgets set for this month yet. Add some under Budgets.</p>
      ) : (
        <>
          {showMarker && (
            <div className="month-progress">
              <div className="month-progress-row">
                <span>Month progress</span>
                <span className="tabular">
                  Day {day} of {days}
                </span>
              </div>
              <div className="month-progress-track">
                <div style={{ width: `${pace * 100}%` }} />
              </div>
            </div>
          )}

          <div className="snapshot-list">
            {rows.map((b) => {
              const over = b.spent > b.limit;
              const ahead = !over && showMarker && b.ratio > pace;
              const width = Math.min(100, b.ratio * 100);
              const state = over ? 'over' : ahead ? 'ahead' : 'ok';
              return (
                <div key={b.categoryId}>
                  <div className="snapshot-head">
                    <span>
                      <span className="color-dot" style={{ background: b.color }} />
                      {b.name}
                    </span>
                    <span className={`snapshot-status ${state}`}>
                      {over ? `${money(b.spent - b.limit)} over` : `${money(b.limit - b.spent)} left`}
                    </span>
                  </div>
                  <div className="snapshot-bar">
                    <div className={`snapshot-fill ${state}`} style={{ width: `${width}%` }} />
                    <span className="snapshot-amount tabular">
                      {money(b.spent)} of {money(b.limit)}
                    </span>
                    {showMarker && <span className="pace-marker" style={{ left: `${pace * 100}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>

          {showMarker && (
            <div className="pace-legend">
              <span className="pace-legend-mark" />
              Where you'd be if you spent evenly all month
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function Dashboard({ month, refreshKey, onNavigate }) {
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
  const lastIndex = trendData.length - 1;
  const insights = summary.insights || [];

  return (
    <div className="dashboard">
      <div className="summary-cards">
        <div className="card kpi">
          <div className="kpi-label">Total income</div>
          <div className="card-value text-income">
            {money(summary.income)}
            {prevMonth && <TrendPill current={summary.income} previous={prevMonth.income} />}
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Total expenses</div>
          <div className="card-value text-expense">
            {money(summary.expenses)}
            {prevMonth && <TrendPill current={summary.expenses} previous={prevMonth.expenses} risingIsGood={false} />}
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Net income</div>
          <div className={`card-value ${summary.net >= 0 ? 'text-income' : 'text-expense'}`}>{money(summary.net)}</div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Savings rate</div>
          <div className="card-value">{savedPct !== null ? `${savedPct.toFixed(0)}%` : '—'}</div>
          {savedPct === null && <div className="card-sub">No income logged yet</div>}
        </div>
      </div>

      <div className="overview-row">
        <section className="panel overview-wide">
          <div className="panel-head">
            <div>
              <div className="kpi-label">Cash flow</div>
              <h3>Where this month's money went</h3>
            </div>
          </div>
          <CashFlow income={summary.income} expenses={summary.expenses} slices={expenseSlices} />
        </section>

        <BudgetSnapshot budgets={summary.budgetProgress} month={month} onNavigate={onNavigate} />
      </div>

      <div className="overview-row">
        <section className="panel overview-wide">
          <div className="panel-head">
            <h3>Alerts</h3>
            {insights.length > 0 && <span className="count-badge">{insights.length}</span>}
          </div>
          {insights.length === 0 ? (
            <p className="empty-hint">Nothing needs your attention this month.</p>
          ) : (
            <ul className="alert-list">
              {insights.map((insight, i) => (
                <li key={i} className={`alert-row ${insight.type}`}>
                  <span className="alert-dot" aria-hidden="true" />
                  <span>{insight.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="kpi-label">Last 6 months</div>
          <h3>Income vs expenses</h3>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={trendData} margin={{ top: 12, right: 0, bottom: 0, left: 0 }} barGap={3}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={44} tickFormatter={(v) => money(v, { compact: true })} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
              <Bar dataKey="income" name="Income" fill="var(--income)" radius={[3, 3, 0, 0]} maxBarSize={14}>
                {trendData.map((_, i) => (
                  <Cell key={i} fillOpacity={i === lastIndex ? 1 : 0.45} />
                ))}
              </Bar>
              <Bar dataKey="expenses" name="Expenses" fill="var(--expense)" radius={[3, 3, 0, 0]} maxBarSize={14}>
                {trendData.map((_, i) => (
                  <Cell key={i} fillOpacity={i === lastIndex ? 1 : 0.45} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mini-legend">
            <span>
              <span className="color-dot" style={{ background: 'var(--income)' }} />
              Income
            </span>
            <span>
              <span className="color-dot" style={{ background: 'var(--expense)' }} />
              Expenses
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
