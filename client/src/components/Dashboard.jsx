import React, { useEffect, useState } from 'react';
import { BarChart, Bar, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, AlertOctagon, AlertTriangle, Sparkles, Check, X } from 'lucide-react';
import { api } from '../api.js';
import { ChartTooltip, axisProps, gridProps, money } from '../chartTheme.jsx';
import CashFlow from './CashFlow.jsx';
import { goalPlan, GOAL_COLORS } from './SavingsGoals.jsx';

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

// "How much can I still spend?" is the question people open a budgeting app to
// answer, so it gets the biggest number on the page. Formula, shown to the user:
// income this month − spent so far − monthly bills not yet marked paid.
function SafeToSpend({ summary, unpaidBills, goalsSetAside, month }) {
  const { day, days } = monthPace(month);
  const isCurrent = day !== null;
  const billsDue = unpaidBills.reduce((s, b) => s + b.amount, 0);
  // Money planned for savings goals this month isn't free to spend.
  const setAside = isCurrent ? goalsSetAside : 0;
  const left = summary.income - summary.expenses - billsDue - setAside;
  const daysLeft = isCurrent ? days - day + 1 : 0;
  const perDay = daysLeft > 0 ? left / daysLeft : null;

  if (summary.income <= 0) {
    return (
      <section className="panel safe-card">
        <div className="kpi-label">Safe to spend</div>
        <div className="safe-value">—</div>
        <p className="safe-note">
          Add this month's income on the Transactions page and this will show how much you can still spend.
        </p>
      </section>
    );
  }

  const short = left < 0;
  return (
    <section className="panel safe-card">
      <div className="kpi-label">{isCurrent ? 'Safe to spend' : 'Left over'}</div>
      <div className={`safe-value ${short ? 'text-expense' : ''}`}>{money(left)}</div>
      <p className="safe-note">
        {short
          ? `Spending and bills are ${money(-left)} more than this month's income.`
          : isCurrent && perDay !== null
            ? `About ${money(perDay)} a day for the ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left, after bills${
                setAside > 0 ? ' and savings goals' : ''
              }.`
            : 'Income left after spending and bills.'}
      </p>
      <details className="safe-details">
        <summary>How this is worked out</summary>
        <dl>
          <div>
            <dt>Income this month</dt>
            <dd className="tabular">{money(summary.income)}</dd>
          </div>
          <div>
            <dt>Spent so far</dt>
            <dd className="tabular">−{money(summary.expenses)}</dd>
          </div>
          <div>
            <dt>Monthly bills not yet paid ({unpaidBills.length})</dt>
            <dd className="tabular">−{money(billsDue)}</dd>
          </div>
          {setAside > 0 && (
            <div>
              <dt>Set aside for savings goals</dt>
              <dd className="tabular">−{money(setAside)}</dd>
            </div>
          )}
          <div className="safe-total">
            <dt>{isCurrent ? 'Safe to spend' : 'Left over'}</dt>
            <dd className="tabular">{money(left)}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function GoalsSnapshot({ goals, onNavigate }) {
  const active = goals
    .map((g) => ({ ...g, plan: goalPlan(g) }))
    .filter((g) => !g.plan.done)
    .sort((a, b) => b.plan.pct - a.plan.pct)
    .slice(0, 3);
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Savings goals</h3>
        <button className="link-btn" onClick={() => onNavigate('goals')}>
          {goals.length ? 'All goals' : 'Add a goal'}
        </button>
      </div>
      {active.length === 0 ? (
        <p className="empty-hint">
          {goals.length
            ? 'Every goal is reached. Time for a new one?'
            : 'Saving for a trip or something new? Make a goal and track it here.'}
        </p>
      ) : (
        <div className="snapshot-list">
          {active.map((g) => (
            <div key={g.id}>
              <div className="snapshot-head">
                <span>
                  <span className="color-dot" style={{ background: g.color || GOAL_COLORS[0] }} />
                  {g.name}
                </span>
                <span className="snapshot-status tabular">
                  {money(g.currentAmount)} of {money(g.targetAmount)}
                </span>
              </div>
              <div className="goal-mini-bar">
                <div style={{ width: `${g.plan.pct}%`, background: g.color || GOAL_COLORS[0] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function UpcomingBills({ bills, hasMonthlyBills, month, onTogglePaid, onNavigate }) {
  const { day } = monthPace(month);
  const sorted = [...bills].sort((a, b) => a.dueDay - b.dueDay).slice(0, 4);
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Bills still to pay</h3>
        <button className="link-btn" onClick={() => onNavigate('bills')}>
          All bills
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="empty-hint">
          {hasMonthlyBills
            ? 'Every monthly bill is marked paid for this month.'
            : 'No monthly bills set up yet. Add rent, phone and subscriptions under Bills.'}
        </p>
      ) : (
        <ul className="bill-list">
          {sorted.map((b) => {
            const late = day !== null && b.dueDay < day;
            const soon = day !== null && !late && b.dueDay - day <= 3;
            return (
              <li key={b.id} className="bill-row">
                <div className="bill-main">
                  <span className="bill-name">{b.name}</span>
                  <span className={`bill-due ${late ? 'late' : soon ? 'soon' : ''}`}>
                    {late ? `Was due the ${ordinal(b.dueDay)}` : `Due the ${ordinal(b.dueDay)}`}
                  </span>
                </div>
                <span className="bill-amount tabular">{money(b.amount, { cents: true })}</span>
                <button className="btn-mini" onClick={() => onTogglePaid(b.id)} aria-label={`Mark ${b.name} paid`}>
                  <Check size={14} /> Paid
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const RECAP_KEY = 'wealthline-recap-dismissed';

// A short look back at last week, at the top of Overview: one question,
// "how did last week go?" It stays until dismissed, then returns next Monday.
// No comparison is shown when there's no previous week to compare with.
function WeeklyRecap({ onNavigate }) {
  const [recap, setRecap] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(RECAP_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    api
      .getWeekRecap(localToday())
      .then(setRecap)
      .catch(() => setRecap(null));
  }, []);

  if (!recap || dismissed === recap.weekStart) return null;

  const dismiss = () => {
    setDismissed(recap.weekStart);
    try {
      localStorage.setItem(RECAP_KEY, recap.weekStart);
    } catch {
      /* fine: hides for this visit */
    }
  };

  const range = `${shortDate(recap.weekStart)} – ${shortDate(recap.weekEnd)}`;
  const close = (
    <button className="icon-btn" onClick={dismiss} aria-label="Dismiss weekly recap" title="Got it">
      <X size={16} />
    </button>
  );

  if (recap.count === 0) {
    return (
      <section className="panel recap recap-empty">
        <div>
          <div className="kpi-label">Last week · {range}</div>
          <p className="recap-line">
            Nothing was logged last week. Add anything you missed so this month's numbers stay accurate.
          </p>
        </div>
        <div className="recap-actions">
          <button className="btn-mini" onClick={() => onNavigate('transactions')}>
            Add transactions
          </button>
          {close}
        </div>
      </section>
    );
  }

  const diff = recap.prevSpent !== null ? recap.spent - recap.prevSpent : null;
  const maxCat = recap.topCategories.length ? recap.topCategories[0].total : 0;

  return (
    <section className="panel recap" aria-labelledby="recap-title">
      <div className="recap-head">
        <div>
          <div className="kpi-label">Your week in review · {range}</div>
          <h3 id="recap-title" className="recap-title">
            You spent {money(recap.spent)} across {recap.count} {recap.count === 1 ? 'transaction' : 'transactions'}
          </h3>
          {diff !== null && Math.abs(diff) >= 1 && (
            <p className="recap-line">
              That's {money(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than the week before ({money(recap.prevSpent)}
              ).
            </p>
          )}
        </div>
        {close}
      </div>

      <div className="recap-body">
        {recap.topCategories.length > 0 && (
          <div className="recap-cats">
            {recap.topCategories.map((c) => (
              <div key={c.categoryId} className="recap-cat">
                <span className="recap-cat-name">
                  <span className="color-dot" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="recap-cat-bar" aria-hidden="true">
                  <span style={{ width: `${maxCat ? (c.total / maxCat) * 100 : 0}%`, background: c.color }} />
                </span>
                <span className="tabular recap-cat-amt">{money(c.total)}</span>
              </div>
            ))}
          </div>
        )}
        <ul className="recap-facts">
          {recap.biggestMove && (
            <li>
              <strong>Biggest change:</strong> {recap.biggestMove.name}, {money(Math.abs(recap.biggestMove.delta))}{' '}
              {recap.biggestMove.delta > 0 ? 'more' : 'less'} than the week before.
            </li>
          )}
          {recap.largestPurchase && (
            <li>
              <strong>Largest purchase:</strong> {recap.largestPurchase.description || recap.largestPurchase.name},{' '}
              {money(recap.largestPurchase.amount, { cents: true })} on {shortDate(recap.largestPurchase.date)}.
            </li>
          )}
          {recap.income > 0 && (
            <li>
              <strong>Income:</strong> {money(recap.income)} came in.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

const ALERT_META = {
  danger: { icon: AlertOctagon, label: 'Over budget' },
  warning: { icon: AlertTriangle, label: 'Heads up' },
  positive: { icon: Sparkles, label: 'Win' }
};

// Every alert says what happened in plain words, carries an icon and a label
// (not colour alone), and offers the next step when there is one.
function AlertRow({ insight, onNavigate }) {
  const meta = ALERT_META[insight.type] || ALERT_META.warning;
  const Icon = meta.icon;
  const action =
    insight.kind === 'budget-over' || insight.kind === 'budget-pace'
      ? { label: 'Review budget', to: 'budgets' }
      : insight.kind === 'swing' && insight.type === 'warning'
        ? { label: 'See transactions', to: 'transactions' }
        : null;
  return (
    <li className={`alert-row ${insight.type}`}>
      <span className="alert-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="alert-text">
        <span className="sr-only">{meta.label}: </span>
        {insight.text}
      </span>
      {action && (
        <button className="link-btn alert-action" onClick={() => onNavigate(action.to)}>
          {action.label}
        </button>
      )}
    </li>
  );
}

export default function Dashboard({ month, refreshKey, onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [goals, setGoals] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getSummary(month)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [month, refreshKey]);

  const loadBills = () => {
    api
      .getBills()
      .then(setBills)
      .catch(() => setBills([]));
  };
  useEffect(loadBills, [refreshKey]);

  useEffect(() => {
    api
      .getGoals()
      .then((all) => setGoals(all.filter((g) => g.kind === 'savings')))
      .catch(() => setGoals([]));
  }, [refreshKey]);

  const togglePaid = async (id) => {
    try {
      await api.toggleBillPaid(id, month);
      loadBills();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <div className="error-box">Couldn't load dashboard: {error}</div>;
  if (!summary) return <div className="loading">Loading…</div>;

  const expenseSlices = foldSlices(summary.byCategory.filter((c) => c.type === 'expense'));
  const trendData = summary.trend.map((t) => ({ ...t, label: formatMonthShort(t.month) }));
  const prevMonth = summary.trend.length >= 2 ? summary.trend[summary.trend.length - 2] : null;
  const savedPct = summary.income > 0 ? ((summary.income - summary.expenses) / summary.income) * 100 : null;
  const lastIndex = trendData.length - 1;
  const insights = summary.insights || [];
  // Weekly and yearly bills don't have a clear due date within the month, so
  // only monthly ones count toward "bills still to pay".
  const unpaidBills = bills.filter(
    (b) => b.active !== false && b.frequency === 'monthly' && !(b.paidMonths || []).includes(month)
  );

  return (
    <div className="dashboard">
      {monthPace(month).day !== null && <WeeklyRecap onNavigate={onNavigate} />}

      <div className="overview-row">
        <SafeToSpend
          summary={summary}
          unpaidBills={unpaidBills}
          goalsSetAside={goals
            .filter((g) => g.currentAmount < g.targetAmount)
            .reduce((s, g) => s + (g.monthlyContribution || 0), 0)}
          month={month}
        />
        <UpcomingBills
          bills={unpaidBills}
          hasMonthlyBills={bills.some((b) => b.active !== false && b.frequency === 'monthly')}
          month={month}
          onTogglePaid={togglePaid}
          onNavigate={onNavigate}
        />
        <GoalsSnapshot goals={goals} onNavigate={onNavigate} />
      </div>

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
          <div className="card-sub">{savedPct === null ? 'No income logged yet' : 'Share of income you kept'}</div>
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
                <AlertRow key={i} insight={insight} onNavigate={onNavigate} />
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
